# 금융회사지배구조 · GraphIQ

**주주·지분 관계**를 **그래프 시각화**와 **자연어 질의(채팅)** 로 탐색하는 서비스. Neo4j 그래프 DB, FastAPI 백엔드, Vis.js 그래프 UI, Streamlit 채팅 UI.

---

## 한눈에 보기 (비개발자용)

서비스와 아키텍처를 **큰 그림**으로 이해하려면 → **docs/archive/ARCHITECTURE-OVERVIEW.md** (한 페이지, 다이어그램 포함, 로컬 참고용)

- **무엇을 하는 서비스인지**
- **화면·API·DB가 어떻게 이어지는지**
- **확장·유지보수·협업을 위해 어떻게 구성되어 있는지**

를 개발 용어 없이 요약해 두었습니다.

---

## 아키텍처 개요 (CTO 관점)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                      사용자 (브라우저)                      │
                    └───────────────────────────┬───────────────────────────────┘
                                                │
        ┌───────────────────────────────────────┼───────────────────────────────────────┐
        │                                       │                                         │
        ▼                                       ▼                                         │
┌───────────────┐                     ┌─────────────────┐                     ┌─────────┴─────────┐
│ Streamlit     │                     │ 그래프 UI        │                     │                  │
│ (채팅 화면)   │                     │ (HTML/JS/Vis.js) │                     │                  │
│ :8501         │                     │ /static/graph.*  │                     │                  │
└───────┬───────┘                     └────────┬────────┘                     │                  │
        │                                      │                              │                  │
        │         ┌────────────────────────────┴────────────────────────────┐ │                  │
        │         │              FastAPI Backend (:8000)                    │ │                  │
        └────────►│  /api/v1/*  ·  /chat  ·  /static  ·  /health  ·  /docs   │◄┘                  │
                 │  (Graph API, Chat API, 정적 파일, OpenAPI)                │                    │
                 └────────────────────────────┬─────────────────────────────┘                    │
                                              │                                                    │
                 ┌────────────────────────────┼────────────────────────────┐                     │
                 ▼                            ▼                            ▼                     │
         ┌───────────────┐            ┌───────────────┐            ┌───────────────┐             │
         │ Neo4j         │            │ OpenAI API    │            │ NetworkX 등   │             │
         │ (그래프 DB)   │            │ (채팅·요약)   │            │ (레이아웃)    │             │
         └───────────────┘            └───────────────┘            └───────────────┘             │
```

- **단일 데이터 소스**: 그래프·채팅 모두 Neo4j 기준. 확장 시 데이터 계약만 맞추면 됨.
- **API 버전화**: `/api/v1/` 로 버전 관리. 하위 호환·점진적 변경 용이.
- **설정 분리**: DB·API 키는 `.env` 에만 두고 코드에 하드코딩하지 않음 (유지보수·보안).

---

## 프로젝트 구조

```
fnco-graph/
├── backend/                 # FastAPI (API + 정적 파일 서빙)
│   ├── app/
│   │   ├── api/v1/          # 버전드 API (graph, chat, system)
│   │   ├── core/             # 설정, Neo4j, 인덱스
│   │   ├── services/        # graph_service, layout_service
│   │   └── main.py
│   ├── static/              # 그래프 UI (단일 페이지 앱)
│   │   ├── graph.html
│   │   ├── graph.js
│   │   └── graph.css
│   └── requirements.txt
├── frontend/                # Streamlit 채팅 앱
│   ├── main.py
│   └── src/
├── docs/                    # 아키텍처·UX·QA·변경 이력
│   ├── ARCHITECTURE-OVERVIEW.md   # 비개발자용 큰 그림
│   ├── CHANGELOG.md
│   └── ...
├── .env.example
├── docker-compose.yml
└── Makefile
```

- **협업**: 기능별로 `backend/app/`, `backend/static/`, `frontend/`, `docs/` 역할이 나뉘어 있어 담당 영역을 나누기 쉬움.
- **유지보수**: API는 `app/api/v1/endpoints/`, 비즈니스 로직은 `app/services/` 에 두어 변경 범위를 한정할 수 있음.

---

## 실행 방법

1. **환경 변수**  
   `make env` 후 `.env` 에 `NEO4J_URI`, `NEO4J_PASSWORD`, `OPENAI_API_KEY` 설정.

2. **Docker (권장)**  
   `make up` → 백엔드 8000, Streamlit 8501.  
   - 그래프 UI: `http://localhost:8000/static/graph.html`  
   - 채팅: `http://localhost:8501`

3. **로컬**  
   `make install` 후  
   - 터미널 1: `make run-be` (백엔드 8000)  
   - 터미널 2: `make run-fe` (Streamlit 8501)  
   - 그래프만 HTTP로: `make serve-graph` → `http://localhost:8080/graph.html` (백엔드 별도 실행)

**테스트**: `make test`  
**연결 실패 시**: `make check-be` 로 백엔드 확인. 원격 서버(무료 플랜)는 절전 후 첫 연결에 30초~1분 걸릴 수 있음.

---

## API 요약

| Method | Path | 설명 |
|--------|------|------|
| GET | `/`, `/health`, `/ping` | 상태·Neo4j 연결 |
| GET | `/stats`, `/search?q=` | 노드/관계 현황, 회사 검색 |
| POST / DELETE | `/chat` | 자연어 채팅·이력 초기화 |
| GET | `/api/v1/graph/nodes`, `/edges`, `/node-counts` | 그래프 노드·엣지·집계 |
| GET | `/api/v1/graph/nodes/{id}`, `/ego` | 노드 상세, Ego 그래프 |
| POST | `/api/v1/graph/layout` | 서버 레이아웃 (NetworkX 등) |

상세: `http://localhost:8000/docs` (OpenAPI)

---

## 확장성·유지보수성·협업

| 관점 | 내용 |
|------|------|
| **확장성** | 노드/엣지·필터·뷰 추가는 API 스키마·상수(`UI_STRINGS`, `GOV_MAP_CONFIG` 등)만 확장. 그래프 UI는 단일 진입점(노드 클릭 → 상세/탭 전환)으로 패턴 통일. |
| **유지보수성** | 설정·문구·DOM ID는 상수/설정 파일로 단일 소스. 그래프·레이아웃·채팅 설계 문서는 `docs/archive/` 에 정리(로컬 참고용). |
| **협업** | README·ARCHITECTURE-OVERVIEW로 온보딩. API 버전·엔드포인트 분리로 프론트/백엔드 역할 분담 용이. |

---

## 관련 문서

문서는 로컬 참고용으로 `docs/archive/` 에 두었으며, Git에는 포함되지 않음.

- **비개발자용 큰 그림**: `docs/archive/ARCHITECTURE-OVERVIEW.md`  
- **그래프 설계**: `docs/archive/PYGRAPHVIZ-VISJS-HYBRID.md` (서버 레이아웃 + Vis.js)  
- **변경 이력**: `docs/archive/CHANGELOG.md`  
- **팀 공유용 CTO 검토**: `docs/archive/CTO-REVIEW-FOR-TEAM.md`
