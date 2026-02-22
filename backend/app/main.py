from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.neo4j_indexes import init_indexes_on_startup



def _cors_origins_list() -> list[str]:
    raw = get_settings().CORS_ORIGINS.strip()
    if not raw or raw == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


api = FastAPI(
    title="GraphIQ API",
    description="주주 네트워크 자연어 질의 (Neo4j GenAI Stack)",
    version="1.0",
)
api.mount("/static", StaticFiles(directory="static"), name="static")
api.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins_list(),
    allow_methods=["*"],
    allow_headers=["*"],
)
# unversioned (Streamlit 기존 경로 호환)
api.include_router(api_router)
# versioned (HTML 그래프 UI 및 향후 확장)
api.include_router(api_router, prefix="/api/v1")


@api.on_event("startup")
async def startup_event():
    """앱 기동 시 Neo4j 인덱스 자동 생성 (CTO: 성능 최적화)"""
    try:
        init_indexes_on_startup()
    except Exception as e:
        # 인덱스 생성 실패해도 앱은 계속 실행 (기능은 동작하나 성능 저하 가능)
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to initialize Neo4j indexes on startup: {e}")
