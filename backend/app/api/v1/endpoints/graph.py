"""
그래프 시각화용 API 엔드포인트.
노드/엣지 조회, 노드 상세 정보 제공, NetworkX 기반 레이아웃.
"""
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from neo4j.exceptions import ServiceUnavailable, TransientError, ClientError

from app.core.sanitize import sanitize_text, SEARCH_MAX_LENGTH
from app.schemas.layout import LayoutRequest, LayoutResponse
from app.services import graph_service
from app.services import layout_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["graph"])

# 노드 상세 응답 캐시 (TTL). 동일 노드 재클릭 시 부하 감소
_NODE_DETAIL_CACHE: dict[str, tuple[float, Any]] = {}
NODE_DETAIL_CACHE_TTL_SEC = 60
_node_detail_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="node_detail")


_ID_RE = re.compile(r"(\d+)$")


def _neo4j_id(node_id: str) -> int:
    """
    프론트에서 오는 node_id (예: n123, c123, p456)를 숫자 Neo4j internal id로 변환.
    """
    m = _ID_RE.search(node_id)
    if not m:
        raise HTTPException(400, "잘못된 node_id 형식입니다.")
    return int(m.group(1))


def _sanitize_search(search: Optional[str]) -> Optional[str]:
    """검색어 정제 (XSS 방지). 공통 정책: app.core.sanitize."""
    return sanitize_text(search, max_length=SEARCH_MAX_LENGTH, allow_none=True)


def _clamp_ratio(val) -> float:
    """지분율(%) 0~100 범위로 제한. 원시 데이터 오류(100% 초과 등)로 인한 표시 버그 방지."""
    if val is None:
        return 0.0
    try:
        v = float(val)
        return max(0.0, min(100.0, v))
    except (TypeError, ValueError):
        return 0.0


@router.get("/nodes")
def get_nodes(
    limit: int = Query(50, ge=1, le=500, description="최대 노드 수"),
    node_type: Optional[str] = Query(None, description="필터: company, person, major, institution"),
    search: Optional[str] = Query(None, description="검색어 (회사명/주주명)"),
    node_ids: Optional[str] = Query(None, description="특정 노드 ID들 (쉼표 구분, 엣지 기반 로드용)"),
):
    """
    그래프 노드 목록 조회 (시각화용).
    
    성능: limit 기본 50, 최대 500. 초기 로드는 작은 샘플 권장.
    """
    graph = graph_service.get_graph()

    nt = (node_type or "").lower().strip() or None
    sanitized_search = _sanitize_search(search)
    
    # node_ids 파라미터 파싱 (엣지 기반 로드용)
    ids: Optional[list[int]] = None
    if node_ids:
        ids = [_neo4j_id(x.strip()) for x in node_ids.split(",") if x.strip()]
    
    params = {"limit": limit, "search": sanitized_search} if sanitized_search else {"limit": limit}
    nodes: list[dict] = []

    try:
        # node_ids가 제공되면 레이블과 무관하게 모든 노드를 한 번에 조회
        if ids:
            # 모든 노드를 ID로 조회 (Company와 Stockholder 모두 포함)
            q = """
                MATCH (n)
                WHERE id(n) IN $ids
                RETURN id(n) AS id,
                       labels(n) AS labels,
                       properties(n) AS props
            """
            rows = graph.query(q, params={"ids": ids})
            
            for r in rows:
                labels = r.get("labels") or []
                props = r.get("props") or {}
                
                # Company 노드 처리
                if "Company" in labels:
                    if nt in (None, "company"):
                        nodes.append({
                            "id": f"n{r['id']}",
                            "type": "company",
                            "label": (props.get("companyName") or "Unknown").strip(),
                            "bizno": props.get("bizno"),
                            "active": props.get("isActive", True),
                            "sub": "회사",
                        })
                
                # Stockholder 노드 처리
                elif "Stockholder" in labels:
                    shareholder_type = (props.get("shareholderType") or "PERSON").upper()
                    is_major = "MajorShareholder" in labels
                    node_t = "major" if is_major else ("institution" if shareholder_type != "PERSON" else "person")
                    
                    if nt in (None, "person", "major", "institution"):
                        if nt and node_t != nt:
                            continue
                        
                        nodes.append({
                            "id": f"n{r['id']}",
                            "type": node_t,
                            "label": (props.get("stockName") or props.get("companyName") or "Unknown").strip(),
                            "shareholderType": shareholder_type,
                            "sub": "최대주주" if is_major else ("기관" if shareholder_type != "PERSON" else "개인주주"),
                        })
        else:
            # 기존 로직: node_ids가 없을 때는 레이블별로 조회
            # 1) Company nodes
            # 텍스트 인덱스(Neo4j 5.x+) 활용, 없으면 CONTAINS 폴백
            if nt in (None, "company"):
                if sanitized_search:
                    # 텍스트 인덱스 사용 시도 (Neo4j 5.x+)
                    q = """
                        CALL db.index.fulltext.queryNodes('company_name_text', $search)
                        YIELD node, score
                        WHERE score > 0.5
                        RETURN id(node) AS id,
                               node.companyName AS label,
                               node.bizno AS bizno,
                               coalesce(node.isActive, true) AS active
                        LIMIT $limit
                    """
                    try:
                        rows = graph.query(q, params={"limit": limit, "search": sanitized_search})
                    except ClientError:
                        # 텍스트 인덱스가 없으면 CONTAINS로 폴백
                        logger.debug("Text index not available, falling back to CONTAINS")
                        q = """
                            MATCH (c:Company)
                            WHERE c.companyName CONTAINS $search
                            RETURN id(c) AS id,
                                   c.companyName AS label,
                                   c.bizno AS bizno,
                                   coalesce(c.isActive, true) AS active
                            LIMIT $limit
                        """
                        rows = graph.query(q, params={"limit": limit, "search": sanitized_search})
                else:
                    q = """
                        MATCH (c:Company)
                        RETURN id(c) AS id,
                               c.companyName AS label,
                               c.bizno AS bizno,
                               coalesce(c.isActive, true) AS active
                        LIMIT $limit
                    """
                    rows = graph.query(q, params={"limit": limit})
                nodes.extend(
                    {
                        "id": f"n{r['id']}",
                        "type": "company",
                        "label": (r.get("label") or r.get("companyName") or "Unknown").strip(),
                        "bizno": r.get("bizno"),
                        "active": r.get("active", True),
                        "sub": "회사",
                    }
                    for r in rows
                )

            # 2) Stockholder nodes (Person/Company, plus MajorShareholder label if present)
            # 텍스트 인덱스 활용, 없으면 CONTAINS 폴백
            if nt in (None, "person", "major", "institution"):
                if sanitized_search:
                    # 텍스트 인덱스 사용 시도
                    q = """
                        CALL db.index.fulltext.queryNodes('stockholder_name_text', $search)
                        YIELD node, score
                        WHERE score > 0.5
                        RETURN id(node) AS id,
                               labels(node) AS labels,
                               coalesce(node.stockName, node.companyName, 'Unknown') AS label,
                               coalesce(node.shareholderType, 'PERSON') AS shareholderType
                        LIMIT $limit
                    """
                    try:
                        rows = graph.query(q, params={"limit": limit, "search": sanitized_search})
                    except ClientError:
                        # 텍스트 인덱스가 없으면 CONTAINS로 폴백
                        logger.debug("Text index not available, falling back to CONTAINS")
                        q = """
                            MATCH (s:Stockholder)
                            WHERE coalesce(s.stockName, s.companyName, '') CONTAINS $search
                            RETURN id(s) AS id,
                                   labels(s) AS labels,
                                   coalesce(s.stockName, s.companyName, 'Unknown') AS label,
                                   coalesce(s.shareholderType, 'PERSON') AS shareholderType
                            LIMIT $limit
                        """
                        rows = graph.query(q, params={"limit": limit, "search": sanitized_search})
                else:
                    q = """
                        MATCH (s:Stockholder)
                        RETURN id(s) AS id,
                               labels(s) AS labels,
                               coalesce(s.stockName, s.companyName, 'Unknown') AS label,
                               coalesce(s.shareholderType, 'PERSON') AS shareholderType
                        LIMIT $limit
                    """
                    rows = graph.query(q, params={"limit": limit})
                for r in rows:
                    labels = r.get("labels") or []
                    shareholder_type = (r.get("shareholderType") or "PERSON").upper()
                    is_major = "MajorShareholder" in labels

                    node_t = "major" if is_major else ("institution" if shareholder_type != "PERSON" else "person")
                    if nt and node_t != nt:
                        continue

                    nodes.append(
                        {
                            "id": f"n{r['id']}",
                            "type": node_t,
                            "label": r.get("label") or "Unknown",
                            "shareholderType": shareholder_type,
                            "sub": "최대주주" if is_major else ("기관" if shareholder_type != "PERSON" else "개인주주"),
                        }
                    )

        # node_ids가 제공된 경우 limit 제한 없이 모든 요청된 노드 반환
        if ids:
            return {"nodes": nodes, "total": len(nodes)}
        return {"nodes": nodes[:limit], "total": len(nodes)}

    except HTTPException:
        raise
    except ServiceUnavailable:
        logger.error("Neo4j 서비스 사용 불가", exc_info=True)
        raise HTTPException(503, "데이터베이스 서비스 사용 불가. 잠시 후 다시 시도해주세요.")
    except TransientError:
        logger.error("Neo4j 일시적 오류", exc_info=True)
        raise HTTPException(503, "일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    except ClientError as e:
        if "Constraint" in str(e) or "constraint" in str(e).lower():
            logger.warning(f"데이터 제약 조건 위반: {e}")
            raise HTTPException(400, "데이터 제약 조건 위반")
        logger.error(f"Neo4j 클라이언트 오류: {e}", exc_info=True)
        raise HTTPException(400, f"쿼리 오류: {str(e)[:200]}")
    except Exception as e:
        logger.error(f"노드 조회 실패: {str(e)}", exc_info=True)
        raise HTTPException(500, f"노드 조회 실패: {str(e)}") from e


@router.get("/node-counts")
def get_node_counts():
    """
    노드 타입별 개수 조회 (필터 표시용).
    성능 최적화: 단일 쿼리로 모든 개수 조회.
    """
    graph = graph_service.get_graph()
    
    try:
        # 단일 쿼리로 모든 노드 타입 개수 조회 (성능 최적화)
        # 주의: shareholderType은 대소문자 구분하므로 toUpper() 사용하여 일관성 유지
        # 기관 노드: shareholderType이 'CORPORATION' 또는 'INSTITUTION'이거나 Company:Stockholder 레이블을 가진 경우
        query = """
        MATCH (c:Company)
        WHERE NOT 'Stockholder' IN labels(c)
        WITH count(c) AS company_count
        MATCH (s:Stockholder)
        WHERE toUpper(coalesce(s.shareholderType, 'PERSON')) = 'PERSON' 
          AND NOT 'MajorShareholder' IN labels(s)
          AND NOT 'Company' IN labels(s)
        WITH company_count, count(s) AS person_count
        MATCH (m:MajorShareholder)
        WITH company_count, person_count, count(m) AS major_count
        MATCH (i:Stockholder)
        WHERE (
            toUpper(coalesce(i.shareholderType, 'PERSON')) IN ['CORPORATION', 'INSTITUTION']
            OR 'Company' IN labels(i)
          )
          AND NOT 'MajorShareholder' IN labels(i)
        RETURN company_count, person_count, major_count, count(i) AS institution_count
        """
        result = graph.query(query)
        
        if not result:
            return {
                "company": 0,
                "person": 0,
                "major": 0,
                "institution": 0,
            }
        
        row = result[0]
        return {
            "company": row.get("company_count", 0),
            "person": row.get("person_count", 0),
            "major": row.get("major_count", 0),
            "institution": row.get("institution_count", 0),
        }
    except ServiceUnavailable:
        logger.error("Neo4j 서비스 사용 불가", exc_info=True)
        raise HTTPException(503, "데이터베이스 서비스 사용 불가. 잠시 후 다시 시도해주세요.")
    except TransientError:
        logger.error("Neo4j 일시적 오류", exc_info=True)
        raise HTTPException(503, "일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    except ClientError as e:
        logger.error(f"Neo4j 클라이언트 오류: {e}", exc_info=True)
        raise HTTPException(400, f"쿼리 오류: {str(e)[:200]}")
    except Exception as e:
        logger.error(f"노드 개수 조회 실패: {str(e)}", exc_info=True)
        raise HTTPException(500, f"노드 개수 조회 실패: {str(e)}") from e


@router.get("/edges")
def get_edges(
    limit: int = Query(100, ge=1, le=1000, description="최대 엣지 수"),
    node_ids: Optional[str] = Query(None, description="특정 노드 ID들 (쉼표 구분)"),
    min_ratio: Optional[float] = Query(None, description="최소 지분율(%) — 미만 관계 제외, 시각화 노이즈 감소"),
):
    """
    그래프 엣지(관계) 목록 조회.
    
    node_ids 제공 시 해당 노드와 연결된 엣지만 반환 (성능 최적화).
    min_ratio 제공 시 해당 지분율 미만 관계는 제외 (초기 로딩 시 5 등 권장).
    """
    graph = graph_service.get_graph()

    ids: Optional[list[int]] = None
    if node_ids:
        ids = [_neo4j_id(x.strip()) for x in node_ids.split(",") if x.strip()]

    # (from,to) 단위 집계. ratio=max(stockRatio), count=관계 건수.
    query = """
        MATCH (s:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
        WHERE ($ids IS NULL OR id(s) IN $ids OR id(c) IN $ids)
        WITH id(s) AS fromId,
             id(c) AS toId,
             max(r.stockRatio) AS ratio,
             count(r) AS relCount
        WHERE ($min_ratio IS NULL OR ratio >= $min_ratio)
        RETURN fromId, toId, ratio, relCount
        ORDER BY ratio DESC
        LIMIT $limit
    """
    params = {"limit": limit, "ids": ids, "min_ratio": min_ratio}

    try:
        rows = graph.query(query, params=params)
        edges = []
        for row in rows:
            r_val = _clamp_ratio(row.get("ratio"))
            edges.append({
                "from": f"n{row['fromId']}",
                "to": f"n{row['toId']}",
                "type": "HOLDS_SHARES",
                "ratio": round(r_val, 1),
                "count": int(row.get("relCount") or 1),
                "label": f"{r_val:.1f}%",
            })
        return {"edges": edges, "total": len(edges)}

    except ServiceUnavailable:
        logger.error("Neo4j 서비스 사용 불가", exc_info=True)
        raise HTTPException(503, "데이터베이스 서비스 사용 불가. 잠시 후 다시 시도해주세요.")
    except TransientError:
        logger.error("Neo4j 일시적 오류", exc_info=True)
        raise HTTPException(503, "일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    except ClientError as e:
        logger.error(f"Neo4j 클라이언트 오류: {e}", exc_info=True)
        raise HTTPException(400, f"쿼리 오류: {str(e)[:200]}")
    except Exception as e:
        logger.error(f"엣지 조회 실패: {str(e)}", exc_info=True)
        raise HTTPException(500, f"엣지 조회 실패: {str(e)}") from e


@router.post("/layout", response_model=LayoutResponse)
def post_layout(body: LayoutRequest):
    """
    그래프 레이아웃 계산 (협업: ratio → 시각적 거리 1/√ratio 규칙).

    엔진:
    - networkx: Kamada-Kawai → Spring 2단계 (기본, 항상 사용 가능)
    - pygraphviz: Graphviz 기반 고품질 레이아웃 (overlap=scale로 라벨 겹침 방지, Graphviz 시스템 라이브러리 필요)

    요청: nodes, edges (프론트와 동일 스키마). 반환 좌표는 0~1 정규화.
    프론트는 (x * (viewportWidth - 2*pad) + pad, y * (viewportHeight - 2*pad) + pad) 로 스케일.
    """
    try:
        engine = body.engine if body.engine in ("networkx", "pygraphviz") else "networkx"
        result = layout_service.compute_layout(
            body.nodes,
            body.edges,
            width=body.width,
            height=body.height,
            padding=body.padding,
            use_components=body.use_components,
            engine=engine,
        )
        return LayoutResponse(positions=result["positions"], components=result["components"])
    except Exception as e:
        logger.error(f"레이아웃 계산 실패: {str(e)}", exc_info=True)
        raise HTTPException(500, f"레이아웃 계산 실패: {str(e)}") from e


@router.get("/nodes/{node_id}")
def get_node_detail(node_id: str):
    """
    특정 노드의 상세 정보 + 연결된 노드 목록.
    성능: 캐시(TTL 60초) + 관련/통계 쿼리 병렬 실행으로 체감 지연 감소.
    """
    graph = graph_service.get_graph()
    neo4j_id = _neo4j_id(node_id)
    cache_key = node_id

    # 캐시 적중 시 즉시 반환 (동일 노드 재클릭 체감 개선)
    now = time.monotonic()
    if cache_key in _NODE_DETAIL_CACHE:
        expiry, payload = _NODE_DETAIL_CACHE[cache_key]
        if now < expiry:
            return payload
        del _NODE_DETAIL_CACHE[cache_key]

    node_query = """
        MATCH (n)
        WHERE id(n) = $id
        RETURN labels(n) AS labels, properties(n) AS props
    """
    related_query = """
        MATCH (n)-[r:HOLDS_SHARES]-(m)
        WHERE id(n) = $id
        WITH m, labels(m) AS labels, properties(m) AS props, max(r.stockRatio) AS ratio
        RETURN id(m) AS id, labels, props, ratio
        ORDER BY ratio DESC
        LIMIT 20
    """
    max_ratio_query = """
        MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
        WHERE id(n) = $id
        WITH DISTINCT s, max(r.stockRatio) AS maxRatio
        RETURN max(maxRatio) AS maxRatio, count(s) AS holderCount
    """
    holdings_query = """
        MATCH (n)-[r:HOLDS_SHARES]->(c:Company)
        WHERE id(n) = $id
        RETURN count(c) AS holdings, avg(r.stockRatio) AS avgRatio
    """

    try:
        node_rows = graph.query(node_query, params={"id": neo4j_id})
        if not node_rows:
            raise HTTPException(404, "노드를 찾을 수 없습니다.")

        node_row = node_rows[0]
        labels = node_row.get("labels", [])
        props = node_row.get("props", {})
        shareholder_type = (props.get("shareholderType") or "PERSON").upper()
        is_company = "Company" in labels
        is_major = "MajorShareholder" in labels
        if is_major:
            node_type = "major"
        elif is_company:
            node_type = "company"
        else:
            node_type = "institution" if shareholder_type != "PERSON" else "person"

        # 관련 노드 + 통계 쿼리 병렬 실행 (체감 지연 감소)
        params_id = {"id": neo4j_id}
        stat_query = max_ratio_query if node_type == "company" else holdings_query
        future_related = _node_detail_executor.submit(
            lambda: graph.query(related_query, params=params_id)
        )
        future_stats = _node_detail_executor.submit(
            lambda: graph.query(stat_query, params=params_id)
        )
        related_rows = future_related.result()
        stat_rows = future_stats.result()

        related = [
            {
                "id": f"n{r['id']}",
                "label": r.get("props", {}).get("companyName")
                or r.get("props", {}).get("stockName", "Unknown"),
                "type": "company"
                if "Company" in (r.get("labels") or [])
                else ("major" if "MajorShareholder" in (r.get("labels") or []) else "person"),
                "ratio": round(_clamp_ratio(r.get("ratio")), 1),
            }
            for r in related_rows
        ]
        stats = []
        if node_type == "company" and stat_rows:
            max_ratio = _clamp_ratio(stat_rows[0].get("maxRatio"))
            holder_count = stat_rows[0].get("holderCount") or 0
            stats = [
                {"val": f"{float(max_ratio):.1f}%", "key": "최대주주 지분율"},
                {"val": str(int(holder_count)), "key": "고유 노드 수"},
            ]
        elif node_type != "company" and stat_rows:
            holdings = stat_rows[0].get("holdings") or 0
            avg_ratio = _clamp_ratio(stat_rows[0].get("avgRatio"))
            stats = [
                {"val": str(int(holdings)), "key": "투자 종목수"},
                {"val": f"{float(avg_ratio):.1f}%", "key": "평균 지분율"},
            ]

        result = {
            "id": f"n{neo4j_id}",
            "type": node_type,
            "label": props.get("companyName") or props.get("stockName", "Unknown"),
            "sub": "회사"
            if node_type == "company"
            else ("최대주주" if node_type == "major" else ("기관" if node_type == "institution" else "개인주주")),
            "stats": stats,
            "props": {k: v for k, v in props.items() if k not in ["nameEmbedding"]},
            "related": related,
        }
        _NODE_DETAIL_CACHE[cache_key] = (now + NODE_DETAIL_CACHE_TTL_SEC, result)
        return result

    except HTTPException:
        raise
    except ServiceUnavailable:
        logger.error("Neo4j 서비스 사용 불가", exc_info=True)
        raise HTTPException(503, "데이터베이스 서비스 사용 불가. 잠시 후 다시 시도해주세요.")
    except TransientError:
        logger.error("Neo4j 일시적 오류", exc_info=True)
        raise HTTPException(503, "일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    except ClientError as e:
        if "Constraint" in str(e) or "constraint" in str(e).lower():
            logger.warning(f"데이터 제약 조건 위반: {e}")
            raise HTTPException(400, "데이터 제약 조건 위반")
        logger.error(f"Neo4j 클라이언트 오류: {e}", exc_info=True)
        raise HTTPException(400, f"쿼리 오류: {str(e)[:200]}")
    except Exception as e:
        logger.error(f"노드 상세 조회 실패 (node_id={node_id}): {str(e)}", exc_info=True)
        raise HTTPException(500, f"노드 상세 조회 실패: {str(e)}") from e


def _row_to_node(r: dict) -> dict:
    """Neo4j row (id, labels, props) → 시각화용 노드 딕셔너리 (공통)."""
    labels = r.get("labels") or []
    props = r.get("props") or {}
    nid = f"n{r['id']}"
    if "Company" in labels:
        return {
            "id": nid,
            "type": "company",
            "label": (props.get("companyName") or "Unknown").strip(),
            "bizno": props.get("bizno"),
            "active": props.get("isActive", True),
            "sub": "회사",
        }
    if "Stockholder" in labels:
        shareholder_type = (props.get("shareholderType") or "PERSON").upper()
        is_major = "MajorShareholder" in labels
        node_t = "major" if is_major else ("institution" if shareholder_type != "PERSON" else "person")
        return {
            "id": nid,
            "type": node_t,
            "label": (props.get("stockName") or props.get("companyName") or "Unknown").strip(),
            "shareholderType": shareholder_type,
            "sub": "최대주주" if is_major else ("기관" if shareholder_type != "PERSON" else "개인주주"),
        }
    return {"id": nid, "type": "company", "label": "Unknown", "sub": ""}


@router.get("/ego")
def get_ego_graph(
    node_id: str = Query(..., description="중심 노드 ID (예: n123)"),
    max_hops: int = Query(2, ge=1, le=3, description="확장 홉 수"),
    max_nodes: int = Query(120, ge=10, le=300, description="최대 노드 수"),
):
    """
    Ego-Graph: 중심 노드 기준 N홉 이내 노드·엣지만 반환 (지배구조 맵용).
    Neo4j에서 (Stockholder)-[:HOLDS_SHARES]->(Company) 방향으로 확장.
    """
    graph = graph_service.get_graph()
    neo4j_id = _neo4j_id(node_id)

    # 1) Ego + 양방향 1..max_hops 이내 노드 수집 (중복 제거)
    # CTO: Neo4j는 관계 패턴 길이를 파라미터로 직접 지원하지 않음
    # 해결: max_hops 값에 따라 쿼리를 동적으로 생성 (1~3 홉만 허용)
    max_hops_clamped = max(1, min(3, max_hops))
    
    # 관계 패턴 길이는 리터럴만 허용, 동적 쿼리 생성
    # 보안: max_hops_clamped는 이미 1~3 범위로 제한되어 있음
    nodes_query = f"""
        MATCH (ego)
        WHERE id(ego) = $id
        OPTIONAL MATCH (ego)-[r1:HOLDS_SHARES*1..{max_hops_clamped}]->(n1)
        OPTIONAL MATCH (ego)<-[r2:HOLDS_SHARES*1..{max_hops_clamped}]-(n2)
        WITH ego, n1, n2
        UNWIND [n1, n2, ego] AS n
        WITH n WHERE n IS NOT NULL
        WITH DISTINCT n
        LIMIT $max_nodes
        RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props
    """
    try:
        rows = graph.query(
            nodes_query, 
            params={"id": neo4j_id, "max_nodes": max_nodes}
        )
    except Exception as e:
        logger.error(f"Ego 노드 조회 실패: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Ego 그래프 조회 실패: {str(e)}") from e

    seen = set()
    nodes = []
    for r in rows:
        nid = r.get("id")
        if nid is None or nid in seen:
            continue
        seen.add(nid)
        nodes.append(_row_to_node(r))

    if not nodes:
        raise HTTPException(404, "해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.")

    node_ids = [int(x["id"].lstrip("n")) for x in nodes]

    # 2) 위 노드들 사이의 HOLDS_SHARES 엣지만 조회
    edges_query = """
        MATCH (a)-[r:HOLDS_SHARES]->(b)
        WHERE id(a) IN $ids AND id(b) IN $ids
        RETURN id(a) AS fromId, id(b) AS toId, r.stockRatio AS ratio
    """
    try:
        edge_rows = graph.query(edges_query, params={"ids": node_ids})
    except ServiceUnavailable:
        logger.error("Neo4j 서비스 사용 불가", exc_info=True)
        raise HTTPException(503, "데이터베이스 서비스 사용 불가. 잠시 후 다시 시도해주세요.")
    except TransientError:
        logger.error("Neo4j 일시적 오류", exc_info=True)
        raise HTTPException(503, "일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    except ClientError as e:
        logger.error(f"Neo4j 클라이언트 오류: {e}", exc_info=True)
        raise HTTPException(400, f"쿼리 오류: {str(e)[:200]}")
    except Exception as e:
        logger.error(f"Ego 엣지 조회 실패: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Ego 그래프 조회 실패: {str(e)}") from e

    edges = []
    for row in edge_rows:
        r_val = _clamp_ratio(row.get("ratio"))
        edges.append({
            "from": f"n{row['fromId']}",
            "to": f"n{row['toId']}",
            "type": "HOLDS_SHARES",
            "ratio": round(r_val, 1),
            "label": f"{r_val:.1f}%",
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "ego_id": f"n{neo4j_id}",
    }
