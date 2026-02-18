"""
앱 전역 설정. 환경변수 기반.
"""
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """필수 환경변수 검증 포함."""

    # Neo4j
    NEO4J_URI: str = ""
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = ""

    # OpenAI
    OPENAI_API_KEY: str = ""

    # 모델
    LLM_MODEL: str = "gpt-4o-mini"
    EMBED_MODEL: str = "text-embedding-3-small"
    EMBED_DIM: int = 1536

    # 앱
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: str = "*"  # 쉼표 구분 화이트리스트, 예: http://localhost:3000,https://app.example.com

    # 어디서 실행하든(project-root에서든 backend/에서든) root의 .env를 찾도록 절대경로 지정
    _ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"  # .../stock-graph/.env
    model_config = {"env_file": str(_ROOT_ENV), "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    for name, val in [("NEO4J_URI", s.NEO4J_URI), ("NEO4J_PASSWORD", s.NEO4J_PASSWORD), ("OPENAI_API_KEY", s.OPENAI_API_KEY)]:
        if not val or val.startswith("your-") or "xxx" in val:
            raise ValueError(f"환경변수 {name} 을(를) .env 에 설정해 주세요.")
    return s
