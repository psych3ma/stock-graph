from fastapi import APIRouter

from app.api.v1.endpoints import chat_router, system_router, graph_router

api_router = APIRouter()
api_router.include_router(system_router)
api_router.include_router(chat_router)
api_router.include_router(graph_router)
