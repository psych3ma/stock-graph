from pydantic import BaseModel


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    cypher: str
    raw: list
    hints: list
    source: str  # DB | DB_EMPTY | LLM
    confidence: str  # HIGH | MEDIUM | LOW
    elapsed: float
