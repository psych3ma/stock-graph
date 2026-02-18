"""API 스펙 테스트. 환경변수 없이 실행 시 일부만 통과하도록 구성 가능."""
import os
import pytest
from fastapi.testclient import TestClient

# 테스트 시 env 미설정이면 mock 가능하도록
os.environ.setdefault("NEO4J_URI", "neo4j+s://test.databases.neo4j.io")
os.environ.setdefault("NEO4J_PASSWORD", "test")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")


@pytest.fixture
def client():
    from app.main import api
    return TestClient(api)


def test_root(client: TestClient):
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert data.get("service") == "GraphIQ"


def test_chat_empty(client: TestClient):
    r = client.post("/chat", json={"question": ""})
    assert r.status_code == 400


def test_chat_whitespace(client: TestClient):
    r = client.post("/chat", json={"question": "   "})
    assert r.status_code == 400


def test_delete_chat(client: TestClient):
    r = client.delete("/chat")
    assert r.status_code == 200
    assert "초기화" in r.json().get("message", "")


def test_search_query_param(client: TestClient):
    r = client.get("/search", params={"q": "삼성", "k": 2})
    assert r.status_code in (200, 503)  # 503 when Neo4j/OpenAI not configured
    if r.status_code == 200:
        data = r.json()
        assert "query" in data and "results" in data
