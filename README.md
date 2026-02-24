# 금융회사지배구조 · GraphIQ

**주주·지분 관계**를 **그래프 시각화**와 **자연어 질의(채팅)** 로 탐색하는 서비스. Neo4j 그래프 DB, FastAPI 서버, Vis.js 그래프 UI, Streamlit 채팅 UI.

---

## 한눈에 보기 (비개발자용)

서비스와 아키텍처를 **큰 그림**으로 이해하려면 → **docs/archive/ARCHITECTURE-OVERVIEW.md** (한 페이지, 다이어그램 포함, 로컬 참고용)

- **무엇을 하는 서비스인지**
- **화면·API·DB가 어떻게 이어지는지**
- **확장·유지보수를 위해 어떻게 구성되어 있는지**

를 개발 용어 없이 요약해 두었습니다.

---

## 아키텍처 개요

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
- **설정 분리**: DB·API 키는 `.env` 에만 두고 코드에 하드코딩하지 않음.

---

## 프로젝트 구조

```
fnco-graph/
├── backend/                 # API·정적 파일 서빙
│   ├── app/
│   │   ├── api/v1/          # API 경로 (graph, chat, system)
│   │   ├── core/            # 설정·DB 연결·인덱스
│   │   ├── services/        # 그래프·레이아웃·채팅 로직
│   │   └── main.py
│   ├── static/              # [그래프 화면] HTML·JS·CSS
│   │   ├── graph.html       # 페이지 구조
│   │   ├── graph.js         # 그래프·패널·채팅 연동 (모듈 구성은 파일 상단 주석 참고)
│   │   └── graph.css
│   └── requirements.txt
├── frontend/                # [채팅 화면] Streamlit
│   ├── main.py
│   └── src/
├── docs/
│   └── archive/             # 아키텍처·변경 이력 (로컬 참고용, Git 제외)
├── .env.example
├── docker-compose.yml
└── Makefile
```

- **역할**: 그래프 화면(backend/static) · 채팅 화면(frontend) · API·DB(backend/app) 로 구분.
- **그래프 UI 모듈**: `graph.js` 상단에 설정·데이터·통신·배치·지배구조맵·그리기·패널·채팅·시작 순서로 구성되어 있음 (비개발자용 설명 포함).

---

## 실행 방법

1. **환경 변수**  
   `make env` 후 `.env` 에 `NEO4J_URI`, `NEO4J_PASSWORD`, `OPENAI_API_KEY` 설정.

2. **Docker (권장)**  
   `make up` → 서버 8000, Streamlit 8501.  
   - 그래프 UI: `http://localhost:8000/static/graph.html`  
   - 채팅: `http://localhost:8501`

3. **로컬**  
   `make install` 후  
   - 터미널 1: `make run-be` (서버 8000)  
   - 터미널 2: `make run-fe` (Streamlit 8501)  
   - 그래프만: `make serve-graph` → `http://localhost:8080/graph.html` (서버 별도 실행)

**테스트**: `make test`  
**연결 실패 시**: `make check-be` 로 서버 확인. 원격(무료 플랜)은 절전 후 첫 연결에 30초~1분 걸릴 수 있음.

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

## 확장·유지보수

| 항목 | 내용 |
|------|------|
| **확장성** | 노드/엣지·필터·뷰 추가는 API 스키마·상수만 확장. 그래프 UI는 노드 클릭 → 상세/탭 전환으로 패턴 통일. |
| **유지보수** | 설정·문구·DOM ID는 상수/설정 파일 단일 소스. 설계 문서는 `docs/archive/` (로컬 참고용). |
| **온보딩** | README·ARCHITECTURE-OVERVIEW. API 버전·엔드포인트 분리로 영역 구분 용이. |

---

## 관련 문서

- **모듈 구성·코드 검토**: `docs/archive/MODULE-MAP-AND-CTO-REVIEW.md` — 비개발자용 모듈 맵, 중복 정리 결과 (로컬 참고용).

문서는 로컬 참고용 `docs/archive/` 에 두었으며, Git에는 포함되지 않음.

- **큰 그림**: `docs/archive/ARCHITECTURE-OVERVIEW.md`  
- **그래프 설계**: `docs/archive/PYGRAPHVIZ-VISJS-HYBRID.md` (서버 레이아웃 + Vis.js)  
- **변경 이력**: `docs/archive/CHANGELOG.md`  
- **검토 요약**: `docs/archive/CTO-REVIEW-FOR-TEAM.md`
