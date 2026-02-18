from fastapi import APIRouter, HTTPException

from app.core.sanitize import sanitize_text, QUESTION_MAX_LENGTH
from app.schemas import ChatRequest, ChatResponse
from app.services import graph_service

router = APIRouter(prefix="/chat", tags=["chat"])


def _sanitize_question(question: str) -> str:
    """질문 정제 (XSS 방지 및 길이 제한). 공통 정책: app.core.sanitize."""
    return sanitize_text(question, max_length=QUESTION_MAX_LENGTH, allow_none=False) or ""


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    if not req.question.strip():
        raise HTTPException(400, "질문이 비어 있습니다.")
    sanitized_question = _sanitize_question(req.question)
    return ChatResponse(**graph_service.ask_graph(sanitized_question))


@router.delete("")
def clear_history():
    graph_service.reset_chat()
    return {"message": "대화 이력이 초기화되었습니다."}
