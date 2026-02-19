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
    """
    상세한 헬스 체크 (Neo4j 연결 상태 포함).
    CTO: 백엔드 및 데이터베이스 상태를 종합적으로 확인.
    """
    from datetime import datetime
    
    health_status = {
        "status": "healthy",
        "backend": "ok",
        "neo4j": "disconnected",
        "timestamp": datetime.now().isoformat(),
    }
    
    try:
        graph = graph_service.get_graph()
        # 간단한 쿼리로 연결 확인
        graph.query("RETURN 1 AS test LIMIT 1")
        health_status["neo4j"] = "connected"
        
        # 노드 통계 (선택적)
        try:
            counts = graph.query(
                "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC LIMIT 10"
            )
            health_status["node_stats"] = counts
        except Exception:
            pass  # 통계 조회 실패해도 헬스 체크는 성공
        
        return health_status
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["neo4j"] = "disconnected"
        health_status["error"] = str(e)[:200]  # 에러 메시지 제한
        
        # Neo4j 연결 실패는 503 반환
        raise HTTPException(
            503,
            detail={
                "status": "unhealthy",
                "message": "일시적으로 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                "neo4j": "disconnected",
                "error": str(e)[:200],
            },
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
