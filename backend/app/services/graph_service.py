"""
Neo4j 연결, Vector Index, GraphCypherQAChain, ask_graph 통합.
"""
import time
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage
from langchain_neo4j import GraphCypherQAChain, Neo4jGraph
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import PromptTemplate
from neo4j.exceptions import ClientError

from app.core import get_settings

# ── Lazy 싱글톤 (앱 기동 시 1회 초기화) ─────────────────────────────────────
_graph: Neo4jGraph | None = None
_embed_model: OpenAIEmbeddings | None = None
_qa_chain: Any = None
_chat_history: list = []


def _get_graph() -> Neo4jGraph:
    global _graph
    if _graph is None:
        s = get_settings()
        _graph = Neo4jGraph(
            url=s.NEO4J_URI,
            username=s.NEO4J_USER,
            password=s.NEO4J_PASSWORD,
            enhanced_schema=True,
        )
        _graph.refresh_schema()
    return _graph


def _get_embed_model() -> OpenAIEmbeddings:
    global _embed_model
    if _embed_model is None:
        s = get_settings()
        _embed_model = OpenAIEmbeddings(model=s.EMBED_MODEL, api_key=s.OPENAI_API_KEY)
    return _embed_model


def _get_qa_chain():
    global _qa_chain
    if _qa_chain is None:
        s = get_settings()
        llm = ChatOpenAI(model=s.LLM_MODEL, temperature=0, max_tokens=1024, api_key=s.OPENAI_API_KEY)
        graph = _get_graph()

        CYPHER_PROMPT = PromptTemplate(
            input_variables=["schema", "question"],
            template="""당신은 Neo4j Cypher 전문가입니다.
아래 스키마와 도메인 지식을 참고하여 사용자 질문에 맞는 Cypher를 작성하세요.

## DB 스키마
{schema}

## 도메인 지식 (반드시 준수)
[노드]
- (c:Company:LegalEntity)  bizno, companyName, isActive(bool), closedDate(Date)
- (p:Person:Stockholder)   personId, stockName(주주명), shareholderType='PERSON'
- (x:Company:Stockholder)  법인 주주  shareholderType='CORPORATION'|'INSTITUTION'
- (:MajorShareholder)      maxStockRatio >= 5% 인 주주

[관계]
- (s:Stockholder)-[:HOLDS_SHARES]->(c:Company)
    stockRatio(Float, 지분율%), stockCount(Int), stockType(보통주|우선주), baseDate(Date), reportYear(Int)
- (c:Company)-[:HAS_COMPENSATION]->(c:Company)
    fiscalYear(Int), registeredExecCount(Int), registeredExecTotalComp(Int, 만원), outsideDirectorCount(Int) 등

[작성 규칙]
1. 주주명 속성은 stockName (name 아님)
2. 회사명 검색 → CONTAINS  예) c.companyName CONTAINS '삼성'
3. 지분율 비교 → Float  예) r.stockRatio >= 50.0
4. 금액 단위 만원, 1억=10000, LIMIT 기본 10
5. Cypher 코드만 반환 — 설명·마크다운 금지

질문: {question}

Cypher:""".strip(),
        )

        QA_PROMPT = PromptTemplate(
            input_variables=["context", "question"],
            template="""당신은 주주 네트워크 분석 전문가입니다.
DB 조회 결과를 바탕으로 질문에 명확하고 친절하게 답변하세요.

질문: {question}

DB 결과:
{context}

[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식
- 결과 없으면 "해당 데이터가 없습니다" 안내, 4줄 이내 간결하게

답변:""".strip(),
        )

        _qa_chain = GraphCypherQAChain.from_llm(
            llm=llm,
            graph=graph,
            cypher_prompt=CYPHER_PROMPT,
            qa_prompt=QA_PROMPT,
            verbose=False,
            return_intermediate_steps=True,
            allow_dangerous_requests=True,
            top_k=10,
        )
    return _qa_chain


# ── Vector Index (회사명 유사 검색) ────────────────────────────────────────
def ensure_vector_index() -> None:
    s = get_settings()
    graph = _get_graph()
    try:
        graph.query(f"""
            CREATE VECTOR INDEX company_name_vector IF NOT EXISTS
            FOR (c:Company) ON (c.nameEmbedding)
            OPTIONS {{
                indexConfig: {{
                    `vector.dimensions`: {s.EMBED_DIM},
                    `vector.similarity_function`: 'cosine'
                }}
            }}
        """)
    except ClientError:
        pass


def find_similar_companies(text: str, top_k: int = 3) -> list[str]:
    embed = _get_embed_model()
    graph = _get_graph()
    vec = embed.embed_query(text)
    rows = graph.query("""
        CALL db.index.vector.queryNodes('company_name_vector', $k, $vec)
        YIELD node, score
        WHERE score > 0.75
        RETURN node.companyName AS name, score
        ORDER BY score DESC
    """, params={"k": top_k, "vec": vec})
    return [r["name"] for r in rows]


# ── 공개 API ───────────────────────────────────────────────────────────────
class GraphService:
    """ask_graph, reset_chat, graph/stats 검색 등."""

    @staticmethod
    def ask_graph(question: str) -> dict:
        t0 = time.time()
        hints = find_similar_companies(question, top_k=3)
        enhanced = question
        if hints:
            enhanced = f"{question}\n[DB 내 유사 회사명: {', '.join(hints)}]"

        chain = _get_qa_chain()
        graph = _get_graph()
        cypher, raw = "", []
        try:
            # 대화 이력 제한: 최근 3턴만 (토큰 수 제한)
            result = chain.invoke({
                "query": enhanced,
                "chat_history": _chat_history[-6:],  # 최근 3턴 (Human+AIMessage 쌍)
            })
            answer = result.get("result", "답변을 생성하지 못했습니다.")
            for step in result.get("intermediate_steps", []):
                if isinstance(step, dict):
                    cypher = cypher or step.get("query", "")
                    ctx = step.get("context")
                    if ctx is not None and not raw:
                        raw = ctx if isinstance(ctx, list) else [{"result": ctx}]
        except Exception as e:
            error_msg = str(e)
            # Context length exceeded 등 LLM 에러는 명확히 구분
            if "context_length" in error_msg.lower() or "token" in error_msg.lower():
                answer = f"⚠️ 질문이 너무 길거나 대화 이력이 너무 깁니다. 질문을 짧게 하거나 대화를 초기화해 주세요.\n\n오류: {error_msg[:200]}"
            else:
                answer = f"⚠️ 오류 발생: {error_msg[:200]}"
            cypher, raw = "", []
            source, confidence = "LLM", "LOW"
            
            # 에러 발생 시 대화 이력에 추가하지 않고 즉시 반환
            return {
                "answer": answer,
                "cypher": cypher,
                "raw": raw,
                "hints": hints,
                "source": source,
                "confidence": confidence,
                "elapsed": round(time.time() - t0, 2),
            }

        if cypher and raw:
            source, confidence = "DB", "HIGH"
        elif cypher and not raw:
            source, confidence = "DB_EMPTY", "MEDIUM"
        else:
            source, confidence = "LLM", "LOW"
            # DB 조회 실패 시에만 LLM 추론 메시지 추가
            if not answer.startswith("⚠️"):
                answer = f"⚠️ DB 조회에 실패하여 LLM 추론으로 답변합니다. 실제 데이터와 다를 수 있습니다.\n\n{answer}"

        # 성공한 경우에만 대화 이력 추가 (에러는 이미 return됨)
        _chat_history.append(HumanMessage(content=question))
        _chat_history.append(AIMessage(content=answer))
        # 대화 이력 최대 6턴 유지 (토큰 수 제한)
        while len(_chat_history) > 12:  # 6턴 = 12개 메시지
            _chat_history.pop(0)
            _chat_history.pop(0)

        return {
            "answer": answer,
            "cypher": cypher,
            "raw": raw,
            "hints": hints,
            "source": source,
            "confidence": confidence,
            "elapsed": round(time.time() - t0, 2),
        }

    @staticmethod
    def reset_chat() -> None:
        global _chat_history
        _chat_history = []

    @staticmethod
    def get_graph():
        """Neo4j 그래프 인스턴스 반환 (연결 상태 확인 및 재연결)"""
        try:
            graph = _get_graph()
            # 연결 상태 확인 (간단한 쿼리 실행)
            graph.query("RETURN 1 AS test LIMIT 1")
            return graph
        except Exception:
            # 연결 실패 시 재연결 시도
            global _graph
            _graph = None
            return _get_graph()

    @staticmethod
    def get_stats() -> dict:
        g = _get_graph()
        return {
            "nodes": g.query("MATCH (n) RETURN labels(n)[0] AS l, count(n) AS n ORDER BY n DESC"),
            "relationships": g.query("MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS n ORDER BY n DESC"),
        }


graph_service = GraphService()
