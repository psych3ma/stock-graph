# 배경

본 프로젝트는 식별이 어려운 금융위원회 지배구조 데이터를 Graph DB(Neo4j)로 재설계하여 복잡한 지분 관계를 직관적으로 시각화한 시스템입니다. Python 기반 ETL 파이프라인을 통해 공공데이터와 외부 기업 정보(비즈노 API)를 결합하고, 이를 금융회사·주주·계열사 간의 온톨로지 스키마에 맞춰 자동 적재했습니다. 특히 OpenAI API를 연동하여 복잡한 쿼리 문법(Cypher) 없이 자연어로 지배구조를 탐색할 수 있도록 했으며, NetworkX와 Vis.js의 하이브리드 렌더링 방식을 도입해 대규모 네트워크 시각화 성능을 최적화했습니다. (사용 기술: Neo4j, Python, FastAPI, Streamlit, Docker 등)

## 구조

```
project-root/
├── backend/          # FastAPI (Neo4j, Graph API, Chat API)
├── frontend/         # Streamlit (채팅) + graph.html (지배구조 시각화, Vis.js)
├── docs/             # CHANGELOG, 아키텍처, 포트폴리오 가이드 (과거 검토는 docs/archive)
├── .env.example
├── docker-compose.yml
└── Makefile
```

## 실행

1. **환경변수**: `make env` 후 `.env`에 `NEO4J_URI`, `NEO4J_PASSWORD`, `OPENAI_API_KEY` 설정  
2. **Docker**: `make up` → API 8000, Streamlit 8501  
3. **로컬**: `make install` → 터미널 1 `make run-be`, 터미널 2 `make run-fe`  
   - 그래프 UI만 HTTP로: `make serve-graph` → http://localhost:8080/graph.html (백엔드 별도 실행)

**테스트**: `make test`

## API 요약

| Method | Path | 설명 |
|--------|------|------|
| GET | /, /health, /ping | 상태·Neo4j 연결 |
| GET | /stats, /search?q= | 노드/관계 현황, 회사 검색 |
| POST / DELETE | /chat | 자연어 채팅·이력 초기화 |
| GET | /api/v1/graph/nodes, /edges, /node-counts | 그래프 노드·엣지·집계 |
| GET | /api/v1/graph/nodes/{id}, /ego | 노드 상세, Ego 그래프 |
| POST | /api/v1/graph/layout | 서버 레이아웃 (NetworkX 등) |

상세: http://localhost:8000/docs (OpenAPI)

## 그래프 아키텍처

서버 레이아웃(NetworkX/PyGraphviz) + Vis.js 클라이언트 렌더링. Ego 그래프·필터·노드 상세 패널 지원.

- 설계: `docs/PYGRAPHVIZ-VISJS-HYBRID.md`  
- 변경 이력: `docs/CHANGELOG.md`  
- 포트폴리오/정리 가이드: `docs/CTO-PORTFOLIO-REVIEW.md`
