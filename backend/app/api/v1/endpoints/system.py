from fastapi import APIRouter, HTTPException

from app.services import graph_service

router = APIRouter(tags=["system"])


@router.get("/")
def root():
    return {"status": "ok", "service": "GraphIQ", "version": "1.0"}


@router.get("/ping")
def ping():
    """
    프로세스 라이브니스 전용. Neo4j/DB 의존 없이 항상 200 반환.
    프론트엔드 'Backend 연결 실패' 판단용으로 사용 (실제로 서버가 떠 있는지만 확인).
    """
    return {"status": "ok", "ping": "pong"}


@router.get("/health")
def health():
    """Neo4j 연결 + 노드 통계. Neo4j 실패 시 503 반환."""
    try:
        counts = graph_service.get_graph().query(
            "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC"
        )
        return {"neo4j": "connected", "nodes": counts}
    except Exception as e:
        raise HTTPException(
            503,
            "일시적으로 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        ) from e


@router.get("/stats")
def db_stats():
    return graph_service.get_stats()


@router.get("/search")
def vector_search(q: str, k: int = 5):
    try:
        from app.services.graph_service import find_similar_companies
        return {"query": q, "results": find_similar_companies(q, top_k=k)}
    except Exception:
        raise HTTPException(
            503,
            "일시적으로 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        )
