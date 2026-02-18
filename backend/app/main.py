from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings


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
