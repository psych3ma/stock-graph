"""
Backend API 호출 전담. 결합도 격리.
"""
import os
from typing import Any

import httpx

BASE_URL = os.environ.get("GRAPHIQ_API_URL", "https://stock-graph-y8v7.onrender.com")
# BASE_URL = os.environ.get("GRAPHIQ_API_URL", "http://localhost:8000")
TIMEOUT = 60.0


def get_status() -> dict:
    r = httpx.get(f"{BASE_URL}/", timeout=5.0)
    r.raise_for_status()
    return r.json()


def get_health() -> dict:
    r = httpx.get(f"{BASE_URL}/health", timeout=10.0)
    r.raise_for_status()
    return r.json()


def get_stats() -> dict:
    r = httpx.get(f"{BASE_URL}/stats", timeout=10.0)
    r.raise_for_status()
    return r.json()


def post_chat(question: str) -> dict[str, Any]:
    r = httpx.post(
        f"{BASE_URL}/chat",
        json={"question": question},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def delete_chat() -> dict:
    r = httpx.delete(f"{BASE_URL}/chat", timeout=5.0)
    r.raise_for_status()
    return r.json()


def get_search(q: str, k: int = 5) -> dict:
    r = httpx.get(f"{BASE_URL}/search", params={"q": q, "k": k}, timeout=10.0)
    r.raise_for_status()
    return r.json()
