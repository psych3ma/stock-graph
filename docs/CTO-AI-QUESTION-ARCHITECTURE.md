# CTO Review: AI 질문 기능 아키텍처 분석

**검토자**: 그래프 DB 전문가 출신 CTO  
**작업 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 목차

1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [데이터 흐름](#데이터-흐름)
4. [핵심 컴포넌트](#핵심-컴포넌트)
5. [Neo4j 통합](#neo4j-통합)
6. [LangChain 통합](#langchain-통합)
7. [벡터 검색](#벡터-검색)
8. [대화 이력 관리](#대화-이력-관리)
9. [에러 처리](#에러-처리)
10. [확장성 및 개선점](#확장성-및-개선점)

---

## 개요

### 기능 설명

**AI 질문 기능**은 사용자가 자연어로 질문하면 Neo4j 그래프 데이터베이스에서 관련 정보를 검색하고 답변을 생성하는 기능입니다.

**주요 특징**:
- 자연어 질문 → Cypher 쿼리 자동 생성
- Neo4j 그래프 DB에서 실제 데이터 조회
- 벡터 검색을 통한 회사명 유사도 매칭
- 대화 이력 기반 컨텍스트 유지
- 생성된 Cypher 쿼리 및 원본 데이터 반환

---

## 시스템 아키텍처

### 전체 구조도

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  graph.html (UI)                                         │   │
│  │  - 채팅 탭 (chatTab)                                     │   │
│  │  - 질문 입력 (chatInput)                                 │   │
│  │  - 메시지 영역 (chatMsgs)                                │   │
│  │  - 컨텍스트 바 (ctxBar)                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           │ HTTP POST /api/v1/chat              │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  graph.js (Logic)                                        │   │
│  │  - sendChatMessage()                                     │   │
│  │  - openChatWithContext()                                  │   │
│  │  - resetChatHistory()                                     │   │
│  │  - renderChatMessage()                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP Request
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  FastAPI Router                                          │   │
│  │  /api/v1/chat (POST)                                     │   │
│  │  - ChatRequest (question: str)                           │   │
│  │  - 질문 정제 (sanitize_text)                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  GraphService.ask_graph()                                │   │
│  │  1. 벡터 검색 (find_similar_companies)                   │   │
│  │  2. 질문 강화 (enhanced question)                        │   │
│  │  3. LangChain QA Chain 실행                               │   │
│  │  4. 결과 파싱 및 반환                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│        ┌──────────────────┼──────────────────┐                │
│        │                  │                    │                │
│        ▼                  ▼                    ▼                │
│  ┌──────────┐      ┌──────────┐        ┌──────────┐           │
│  │ OpenAI   │      │ LangChain │        │  Neo4j   │           │
│  │ Embed    │      │ QA Chain  │        │  Graph   │           │
│  │ Model    │      │           │        │   DB     │           │
│  └──────────┘      └──────────┘        └──────────┘           │
│        │                  │                    │                │
│        │                  │                    │                │
│        └──────────────────┼──────────────────┘                │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ChatResponse                                             │   │
│  │  - answer: str                                            │   │
│  │  - cypher: str                                            │   │
│  │  - raw: list                                              │   │
│  │  - hints: list                                            │   │
│  │  - source: str (DB | DB_EMPTY | LLM)                     │   │
│  │  - confidence: str (HIGH | MEDIUM | LOW)                │   │
│  │  - elapsed: float                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 데이터 흐름

### 1. 사용자 질문 입력

**프론트엔드** (`frontend/graph.js`):
```javascript
// 사용자가 질문 입력
const question = document.getElementById("chatInput").value.trim();

// 컨텍스트가 있으면 질문 강화
const contextLabel = chatContext ? chatContext.label : null;
const enhancedQ = contextLabel
  ? `"${contextLabel}"에 대해: ${question}`
  : question;

// API 호출
const res = await apiCall("/api/v1/chat", {
  method: "POST",
  body: JSON.stringify({ question: enhancedQ }),
});
```

**흐름**:
1. 사용자가 채팅 입력창에 질문 입력
2. 노드 선택 시 컨텍스트 추가 (`openChatWithContext()`)
3. 질문이 노드 컨텍스트와 결합되어 강화됨
4. HTTP POST 요청으로 백엔드에 전송

---

### 2. 백엔드 질문 처리

**API 엔드포인트** (`backend/app/api/v1/endpoints/chat.py`):
```python
@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    if not req.question.strip():
        raise HTTPException(400, "질문이 비어 있습니다.")
    sanitized_question = _sanitize_question(req.question)
    return ChatResponse(**graph_service.ask_graph(sanitized_question))
```

**처리 단계**:
1. **입력 검증**: 질문이 비어있지 않은지 확인
2. **질문 정제**: XSS 방지 및 길이 제한 (`sanitize_text`)
3. **GraphService 호출**: `ask_graph()` 메서드 실행

---

### 3. 벡터 검색 (회사명 유사도 매칭)

**벡터 검색** (`backend/app/services/graph_service.py`):
```python
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
```

**처리 단계**:
1. **임베딩 생성**: OpenAI Embeddings 모델로 질문을 벡터로 변환
2. **벡터 검색**: Neo4j 벡터 인덱스에서 유사한 회사명 검색
3. **임계값 필터링**: 유사도 점수 > 0.75인 결과만 반환
4. **질문 강화**: 유사 회사명을 질문에 추가하여 컨텍스트 제공

**예시**:
```
질문: "삼성전자 주주는 누구야?"
벡터 검색 결과: ["삼성전자", "삼성SDI", "삼성물산"]
강화된 질문: "삼성전자 주주는 누구야?\n[DB 내 유사 회사명: 삼성전자, 삼성SDI, 삼성물산]"
```

---

### 4. LangChain QA Chain 실행

**QA Chain 구성** (`backend/app/services/graph_service.py`):
```python
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
```

**처리 단계**:

#### 4.1 Cypher 쿼리 생성

**Cypher Prompt**:
```
당신은 Neo4j Cypher 전문가입니다.
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

Cypher:
```

**처리**:
1. LLM이 스키마와 도메인 지식을 참고하여 Cypher 쿼리 생성
2. 생성된 Cypher 쿼리를 Neo4j에서 실행
3. 쿼리 결과를 컨텍스트로 사용

#### 4.2 답변 생성

**QA Prompt**:
```
당신은 주주 네트워크 분석 전문가입니다.
DB 조회 결과를 바탕으로 질문에 명확하고 친절하게 답변하세요.

질문: {question}

DB 결과:
{context}

[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식
- 결과 없으면 "해당 데이터가 없습니다" 안내, 4줄 이내 간결하게

답변:
```

**처리**:
1. DB 조회 결과를 컨텍스트로 사용
2. LLM이 자연어 답변 생성
3. 답변 규칙에 따라 형식화

---

### 5. 결과 파싱 및 반환

**결과 파싱** (`backend/app/services/graph_service.py`):
```python
result = chain.invoke({
    "query": enhanced,
    "chat_history": _chat_history[-6:],  # 최근 3턴
})

answer = result.get("result", "답변을 생성하지 못했습니다.")
for step in result.get("intermediate_steps", []):
    if isinstance(step, dict):
        cypher = cypher or step.get("query", "")
        ctx = step.get("context")
        if ctx is not None and not raw:
            raw = ctx if isinstance(ctx, list) else [{"result": ctx}]
```

**신뢰도 판단**:
```python
if cypher and raw:
    source, confidence = "DB", "HIGH"
elif cypher and not raw:
    source, confidence = "DB_EMPTY", "MEDIUM"
else:
    source, confidence = "LLM", "LOW"
```

**반환 형식**:
```python
{
    "answer": str,        # 자연어 답변
    "cypher": str,       # 생성된 Cypher 쿼리
    "raw": list,         # 원본 DB 조회 결과
    "hints": list,       # 벡터 검색 결과 (유사 회사명)
    "source": str,       # DB | DB_EMPTY | LLM
    "confidence": str,   # HIGH | MEDIUM | LOW
    "elapsed": float,    # 처리 시간 (초)
}
```

---

### 6. 프론트엔드 결과 렌더링

**메시지 렌더링** (`frontend/graph.js`):
```javascript
function renderChatMessage(role, content, data = {}) {
  // 사용자 메시지 또는 AI 답변 렌더링
  // Cypher 쿼리, 원본 데이터, 신뢰도 표시
}
```

**표시 정보**:
- 자연어 답변
- 생성된 Cypher 쿼리 (고급 사용자용)
- 원본 DB 조회 결과 (확장 가능)
- 벡터 검색 힌트
- 신뢰도 및 소스 표시
- 처리 시간

---

## 핵심 컴포넌트

### 1. 프론트엔드 컴포넌트

#### 1.1 채팅 UI (`frontend/graph.html`)

**구조**:
```html
<div class="panel-body chat-section" id="chatTab">
  <!-- 컨텍스트 바 -->
  <div class="chat-context-bar" id="ctxBar">
    <span class="ctx-label">컨텍스트:</span>
    <span class="ctx-chip" id="ctxChip"></span>
  </div>

  <!-- 메시지 영역 -->
  <div class="chat-msgs" id="chatMsgs">
    <!-- 제안 질문 버튼 -->
    <div class="suggestions" id="globalSugs">
      <button class="sug-item" data-q="지분율 50% 이상인 최대주주 목록을 보여줘">
        지분율 50% 이상 최대주주 목록
      </button>
      <!-- ... -->
    </div>
  </div>

  <!-- 입력 영역 -->
  <div class="chat-input-area">
    <textarea class="chat-textarea" id="chatInput"></textarea>
    <button class="chat-send" id="chatSend"></button>
    <button class="chat-reset-btn" id="chatResetBtn">대화 초기화</button>
  </div>
</div>
```

**기능**:
- 질문 입력 및 전송
- 메시지 표시
- 컨텍스트 관리 (노드 선택 시)
- 대화 이력 초기화
- 제안 질문 버튼

#### 1.2 채팅 로직 (`frontend/graph.js`)

**주요 함수**:
- `sendChatMessage(question)`: 질문 전송 및 응답 처리
- `openChatWithContext(nodeId, label, type)`: 노드 컨텍스트로 채팅 열기
- `resetChatHistory()`: 대화 이력 초기화
- `renderChatMessage(role, content, data)`: 메시지 렌더링

---

### 2. 백엔드 컴포넌트

#### 2.1 API 엔드포인트 (`backend/app/api/v1/endpoints/chat.py`)

**엔드포인트**:
- `POST /api/v1/chat`: 질문 처리
- `DELETE /api/v1/chat`: 대화 이력 초기화

**요청/응답 스키마**:
```python
class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str
    cypher: str
    raw: list
    hints: list
    source: str
    confidence: str
    elapsed: float
```

#### 2.2 GraphService (`backend/app/services/graph_service.py`)

**주요 메서드**:
- `ask_graph(question: str) -> dict`: 질문 처리 메인 로직
- `reset_chat() -> None`: 대화 이력 초기화
- `find_similar_companies(text: str, top_k: int) -> list[str]`: 벡터 검색

**Lazy 싱글톤 패턴**:
```python
_graph: Neo4jGraph | None = None
_embed_model: OpenAIEmbeddings | None = None
_qa_chain: Any = None
_chat_history: list = []

def _get_graph() -> Neo4jGraph:
    global _graph
    if _graph is None:
        # 초기화 로직
    return _graph
```

---

## Neo4j 통합

### 1. 그래프 스키마

**노드 타입**:
- `(c:Company:LegalEntity)`: 회사
  - 속성: `bizno`, `companyName`, `isActive`, `closedDate`, `nameEmbedding`
- `(p:Person:Stockholder)`: 개인 주주
  - 속성: `personId`, `stockName`, `shareholderType='PERSON'`
- `(x:Company:Stockholder)`: 법인 주주
  - 속성: `shareholderType='CORPORATION'|'INSTITUTION'`
- `(:MajorShareholder)`: 최대주주 (지분율 >= 5%)

**관계 타입**:
- `(s:Stockholder)-[:HOLDS_SHARES]->(c:Company)`
  - 속성: `stockRatio`, `stockCount`, `stockType`, `baseDate`, `reportYear`
- `(c:Company)-[:HAS_COMPENSATION]->(c:Company)`
  - 속성: `fiscalYear`, `registeredExecCount`, `registeredExecTotalComp`, `outsideDirectorCount`

### 2. 인덱스 및 제약 조건

**벡터 인덱스**:
```cypher
CREATE VECTOR INDEX company_name_vector IF NOT EXISTS
FOR (c:Company) ON (c.nameEmbedding)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
}
```

**텍스트 인덱스**:
```cypher
CREATE TEXT INDEX company_name_text IF NOT EXISTS
FOR (c:Company) ON (c.companyName)
```

**범위 인덱스**:
```cypher
CREATE INDEX holds_shares_ratio IF NOT EXISTS
FOR ()-[r:HOLDS_SHARES]-() ON (r.stockRatio)
```

**고유 제약 조건**:
```cypher
CREATE CONSTRAINT bizno_unique IF NOT EXISTS
FOR (c:Company) REQUIRE c.bizno IS UNIQUE
```

### 3. Neo4jGraph 통합

**초기화**:
```python
_graph = Neo4jGraph(
    url=s.NEO4J_URI,
    username=s.NEO4J_USER,
    password=s.NEO4J_PASSWORD,
    enhanced_schema=False,  # 토큰 수 제한을 위해 기본 스키마만 사용
)
_graph.refresh_schema()
```

**스키마 관리**:
- `enhanced_schema=False`: 기본 스키마만 사용 (토큰 수 제한)
- 도메인 지식은 프롬프트에 명시하여 LLM에 제공
- 스키마 토큰 수 최소화로 컨텍스트 길이 초과 방지

---

## LangChain 통합

### 1. GraphCypherQAChain

**구성 요소**:
- **LLM**: OpenAI ChatOpenAI (GPT 모델)
- **Graph**: Neo4jGraph 인스턴스
- **Cypher Prompt**: Cypher 쿼리 생성 프롬프트
- **QA Prompt**: 자연어 답변 생성 프롬프트

**설정**:
```python
_qa_chain = GraphCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    cypher_prompt=CYPHER_PROMPT,
    qa_prompt=QA_PROMPT,
    verbose=False,
    return_intermediate_steps=True,  # Cypher 쿼리 및 컨텍스트 반환
    allow_dangerous_requests=True,  # 위험한 쿼리 허용 (필요시)
    top_k=10,  # 상위 10개 결과만 사용
)
```

**처리 흐름**:
1. 사용자 질문 + 대화 이력 → Cypher Prompt
2. LLM이 Cypher 쿼리 생성
3. Neo4j에서 쿼리 실행
4. 쿼리 결과 → QA Prompt
5. LLM이 자연어 답변 생성

### 2. 프롬프트 엔지니어링

**Cypher Prompt 전략**:
- **스키마 정보**: Neo4j 스키마 자동 주입
- **도메인 지식**: 주주 네트워크 도메인 규칙 명시
- **작성 규칙**: 속성명, 데이터 타입, 쿼리 패턴 가이드
- **출력 형식**: Cypher 코드만 반환 (설명 제거)

**QA Prompt 전략**:
- **역할 정의**: 주주 네트워크 분석 전문가
- **답변 규칙**: 수치 형식, 간결성, 결과 없음 처리
- **컨텍스트 활용**: DB 조회 결과를 직접 참조

---

## 벡터 검색

### 1. 임베딩 모델

**모델**: OpenAI Embeddings (`text-embedding-ada-002` 또는 `text-embedding-3-small`)

**설정**:
```python
_embed_model = OpenAIEmbeddings(
    model=s.EMBED_MODEL,
    api_key=s.OPENAI_API_KEY
)
```

**차원**: 1536 (기본) 또는 설정값

### 2. 벡터 인덱스

**인덱스 생성**:
```cypher
CREATE VECTOR INDEX company_name_vector IF NOT EXISTS
FOR (c:Company) ON (c.nameEmbedding)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
}
```

**특징**:
- **유사도 함수**: Cosine 유사도
- **차원**: 1536 (OpenAI Embeddings 기본)
- **임계값**: 0.75 (유사도 점수)

### 3. 검색 프로세스

**단계**:
1. 질문 텍스트 → 임베딩 벡터 변환
2. Neo4j 벡터 인덱스에서 유사 회사명 검색
3. 유사도 점수 > 0.75인 결과만 필터링
4. 상위 K개 결과 반환 (기본: 3개)

**사용 목적**:
- 오타나 약칭 처리
- 유사 회사명 제안
- 질문 컨텍스트 강화

---

## 대화 이력 관리

### 1. 이력 저장

**저장 방식**:
```python
_chat_history: list = []  # 전역 변수 (메모리)

# 메시지 추가
_chat_history.append(HumanMessage(content=question))
_chat_history.append(AIMessage(content=answer))
```

**형식**: LangChain 메시지 객체 (`HumanMessage`, `AIMessage`)

### 2. 이력 제한

**최대 이력**:
- 최근 3턴만 유지 (6개 메시지: Human + AI 쌍)
- 토큰 수 제한을 위해 제한적 유지

**제한 로직**:
```python
while len(_chat_history) > 12:  # 6턴 = 12개 메시지
    _chat_history.pop(0)
    _chat_history.pop(0)
```

**QA Chain 전달**:
```python
result = chain.invoke({
    "query": enhanced,
    "chat_history": _chat_history[-6:],  # 최근 3턴만
})
```

### 3. 이력 초기화

**API 엔드포인트**:
```python
@router.delete("")
def clear_history():
    graph_service.reset_chat()
    return {"message": "대화 이력이 초기화되었습니다."}
```

**프론트엔드**:
```javascript
async function resetChatHistory() {
  await apiCall("/api/v1/chat", { method: "DELETE" });
  // UI 업데이트
}
```

---

## 에러 처리

### 1. 입력 검증

**빈 질문 처리**:
```python
if not req.question.strip():
    raise HTTPException(400, "질문이 비어 있습니다.")
```

**질문 정제**:
```python
sanitized_question = sanitize_text(
    question,
    max_length=QUESTION_MAX_LENGTH,
    allow_none=False
)
```

### 2. LLM 에러 처리

**컨텍스트 길이 초과**:
```python
if "context_length" in error_msg.lower() or "token" in error_msg.lower():
    answer = f"⚠️ 질문이 너무 길거나 대화 이력이 너무 깁니다. 질문을 짧게 하거나 대화를 초기화해 주세요.\n\n오류: {error_msg[:200]}"
```

**일반 에러**:
```python
else:
    answer = f"⚠️ 오류 발생: {error_msg[:200]}"
```

**에러 시 대화 이력 미추가**:
```python
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
```

### 3. DB 조회 실패 처리

**신뢰도 판단**:
```python
if cypher and raw:
    source, confidence = "DB", "HIGH"
elif cypher and not raw:
    source, confidence = "DB_EMPTY", "MEDIUM"
else:
    source, confidence = "LLM", "LOW"
    if not answer.startswith("⚠️"):
        answer = f"⚠️ DB 조회에 실패하여 LLM 추론으로 답변합니다. 실제 데이터와 다를 수 있습니다.\n\n{answer}"
```

---

## 확장성 및 개선점

### 1. 현재 아키텍처의 강점

✅ **명확한 책임 분리**: 프론트엔드/백엔드/DB 계층 분리  
✅ **Lazy 싱글톤 패턴**: 리소스 효율적 관리  
✅ **벡터 검색 통합**: 유사 회사명 매칭  
✅ **대화 이력 관리**: 컨텍스트 유지  
✅ **에러 처리**: 다양한 에러 시나리오 대응  
✅ **신뢰도 표시**: DB/LLM 소스 구분

### 2. 개선 가능 영역

#### 2.1 확장성 (Scalability)

**현재 제한사항**:
- 대화 이력이 메모리에만 저장 (서버 재시작 시 손실)
- 단일 서버 인스턴스 (수평 확장 불가)

**개선 방안**:
- **대화 이력 영구 저장**: Redis 또는 DB에 저장
- **세션 관리**: 사용자별 세션 ID로 이력 분리
- **로드 밸런싱**: 여러 서버 인스턴스 지원

#### 2.2 성능 (Performance)

**현재 제한사항**:
- 벡터 검색이 매 질문마다 실행 (캐싱 없음)
- LLM 호출이 동기적 (응답 시간 지연)

**개선 방안**:
- **벡터 검색 캐싱**: 자주 검색되는 회사명 캐싱
- **비동기 처리**: LLM 호출을 비동기로 처리
- **스트리밍 응답**: 답변 생성 중 스트리밍

#### 2.3 신뢰성 (Reliability)

**현재 제한사항**:
- Neo4j 연결 실패 시 재연결 로직 부족
- LLM API 실패 시 재시도 로직 없음

**개선 방안**:
- **연결 풀링**: Neo4j 연결 풀 관리
- **재시도 로직**: LLM API 실패 시 지수 백오프 재시도
- **폴백 메커니즘**: LLM 실패 시 기본 답변 제공

#### 2.4 보안 (Security)

**현재 제한사항**:
- Cypher 쿼리 생성 시 위험한 쿼리 허용 (`allow_dangerous_requests=True`)
- 입력 검증이 기본적 수준

**개선 방안**:
- **Cypher 쿼리 검증**: 위험한 쿼리 패턴 필터링
- **Rate Limiting**: API 호출 제한
- **인증/인가**: 사용자 인증 및 권한 관리

#### 2.5 모니터링 (Monitoring)

**현재 제한사항**:
- 처리 시간만 기록 (상세 메트릭 없음)
- 에러 로깅이 기본적 수준

**개선 방안**:
- **메트릭 수집**: Prometheus/Grafana 통합
- **로깅 강화**: 구조화된 로깅 (JSON)
- **분석 대시보드**: 질문 유형, 성공률, 응답 시간 분석

---

## 결론

### 현재 상태

**강점**:
- ✅ 명확한 아키텍처 및 책임 분리
- ✅ Neo4j 그래프 DB 통합
- ✅ LangChain을 통한 Cypher 자동 생성
- ✅ 벡터 검색을 통한 컨텍스트 강화
- ✅ 대화 이력 기반 컨텍스트 유지

**개선 필요 영역**:
- ⚠️ 확장성: 대화 이력 영구 저장, 세션 관리
- ⚠️ 성능: 캐싱, 비동기 처리, 스트리밍
- ⚠️ 신뢰성: 재연결 로직, 재시도 로직
- ⚠️ 보안: Cypher 쿼리 검증, Rate Limiting
- ⚠️ 모니터링: 메트릭 수집, 로깅 강화

### 권장 사항

1. **단기 (P0)**:
   - 대화 이력 영구 저장 (Redis)
   - Cypher 쿼리 검증 강화
   - 에러 로깅 강화

2. **중기 (P1)**:
   - 벡터 검색 캐싱
   - 비동기 처리 및 스트리밍
   - 메트릭 수집

3. **장기 (P2)**:
   - 세션 관리 및 사용자 인증
   - 로드 밸런싱 및 수평 확장
   - 분석 대시보드

---

## 관련 파일

### 프론트엔드
- `frontend/graph.html`: 채팅 UI 구조
- `frontend/graph.js`: 채팅 로직 (라인 2575-2850)

### 백엔드
- `backend/app/api/v1/endpoints/chat.py`: API 엔드포인트
- `backend/app/services/graph_service.py`: 핵심 로직
- `backend/app/schemas/chat.py`: 요청/응답 스키마
- `backend/app/core/config.py`: 설정 관리

### 문서
- `docs/CTO-AI-QUESTION-ARCHITECTURE.md`: 본 문서
