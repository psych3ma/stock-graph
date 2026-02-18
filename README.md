# GraphIQ

주주 네트워크 **자연어 질의** 서비스. Neo4j GenAI Stack + GraphCypherQAChain + FastAPI + Streamlit.

## 구조

```
project-root/
├── backend/          # FastAPI (API, Neo4j, LLM)
├── frontend/          # Streamlit (채팅 UI)
├── data/              # 로컬 데이터 (Git 제외)
├── docs/              # CTO/UX 검토 문서
├── .env.example
├── docker-compose.yml
└── Makefile
```

## 빠른 실행

1. **환경변수**
   ```bash
   make env
   # .env 에 NEO4J_URI, NEO4J_PASSWORD, OPENAI_API_KEY 입력
   ```

2. **Docker 한 줄**
   ```bash
   make up
   ```
   - API: http://localhost:8000  
   - UI: http://localhost:8501  
   - API Docs: http://localhost:8000/docs  

3. **로컬 개발**
   ```bash
   make install
   make run-be    # 터미널 1
   make run-fe    # 터미널 2
   ```

## 테스트

```bash
make test
```

## API 요약

| Method | Path | 설명 |
|--------|------|------|
| GET | / | 상태 |
| GET | /health | Neo4j 연결·노드 통계 |
| POST | /chat | 자연어 질의 |
| DELETE | /chat | 대화 이력 초기화 |
| GET | /stats | DB 노드·관계 현황 |
| GET | /search?q=... | 회사명 벡터 검색 |

## 문서

- `docs/CTO_REVIEW_GraphIQ.md` — CTO 관점 아키텍처·확장성·운영
- `docs/UX_REVIEW_GraphIQ.md` — UX 검토
