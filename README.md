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
   - **그래프 시각화**: `frontend/graph.html` 브라우저에서 열기

3. **로컬 개발**
   ```bash
   make install
   make run-be    # 터미널 1
   make run-fe    # 터미널 2
   ```

## 그래프 시각화 아키텍처

**하이브리드 방식**: PyGraphviz (서버 레이아웃 계산) + Vis.js (클라이언트 렌더링)

- **레이아웃**: PyGraphviz neato 엔진으로 결정론적·고품질 레이아웃 (Docker 이미지에 포함)
- **렌더링**: Vis.js로 부드러운 엣지·라벨 배경·인터랙션 제공 (`physics: false`로 서버 좌표 고정)
- **폴백**: PyGraphviz 실패 시 NetworkX, 서버 레이아웃 실패 시 클라이언트 force 시뮬레이션

자세한 내용: [`docs/PYGRAPHVIZ-VISJS-HYBRID.md`](docs/PYGRAPHVIZ-VISJS-HYBRID.md) · 다음 단계: [`docs/NEXT-STEPS.md`](docs/NEXT-STEPS.md)

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

### 핵심 문서
- `docs/CHANGELOG.md` — 변경 이력 (시간순)
- `docs/PYGRAPHVIZ-VISJS-HYBRID.md` — **하이브리드 아키텍처 설계 문서** (PyGraphviz+Vis.js, 서버 계산+클라이언트 렌더링)
- `docs/NEXT-STEPS.md` — 다음 단계 실행 가이드 (Docker·배포·확인)
- `docs/ACTION-ITEMS.md` — 설정·액션 아이템 (결정용)
- `docs/QA-ISSUES-GRAPH-VISUALIZATION.md` — QA 이슈 추적
- `docs/NETWORKX-EXPERT-REVIEW.md` — NetworkX 레이아웃 검토 + 적용
- `docs/CTO-LAYOUT-HAIRBALL-FIX.md` — 털뭉치 해소 수정

### 검토 문서
- `docs/CTO_REVIEW_GraphIQ.md` — CTO 관점 아키텍처·확장성·운영
- `docs/UX_REVIEW_GraphIQ.md` — UX 검토
- `docs/QA-BACKEND-FRONTEND-ISSUES.md` — 백엔드/프론트 이슈 리스트

**레거시 문서**: `docs/archive/` 폴더에 보관 (과거 수정 이력)
