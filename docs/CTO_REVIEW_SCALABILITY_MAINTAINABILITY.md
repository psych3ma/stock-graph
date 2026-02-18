# CTO 관점 검토: 확장성 · 유지보수성 · 일관성

**검토 일자**: 2026-02-17  
**관점**: 확장성(Scalability), 유지보수성(Maintainability), 일관성(Consistency)

---

## 적용한 개선 (이번 검토에서 반영)

| 항목 | 내용 |
|------|------|
| **입력 정제 일관성** | `backend/app/core/sanitize.py` 추가. `sanitize_text()`, `SEARCH_MAX_LENGTH`, `QUESTION_MAX_LENGTH`로 통일. graph/chat 엔드포인트에서 공통 사용. |
| **프론트 설정 일원화** | `frontend/graph.html`에 `GRAPH_CONFIG` 도입. `limits`(nodes, edges, nodesFallback), `nodeTypes` 한 곳에서 관리. `activeFilters`·`nodeCounts`·API 호출 limit이 config 기반으로 동작. |

---

## 1. 확장성 (Scalability)

### 1.1 현재 상태

| 영역 | 상태 | 비고 |
|------|------|------|
| API 버전링 | ✅ | `/api/v1` prefix로 버전 분리 |
| 설정 | ✅ | 환경변수·Pydantic 기반 |
| DB 연결 | ⚠️ | 싱글톤 Neo4j, 재연결 로직 있음 |
| 그래프 크기 | ⚠️ | 노드/엣지 limit 하드코딩(50·200·500) |
| 프론트 번들 | ❌ | 단일 HTML 1,957줄, 코드 분할 없음 |

### 1.2 개선 제안

- **백엔드**
  - 노드/엣지 limit을 설정 또는 쿼리 파라미터로 통일하고, 최대값·기본값을 한 곳에서 관리.
  - 대용량 그래프 대비: 커서/페이지네이션 또는 Lazy loading 검토.
  - (선택) Redis 등 캐시로 `node-counts`·자주 쓰는 쿼리 결과 캐싱.
- **프론트**
  - 그래프 UI를 별도 JS 모듈(또는 여러 파일)로 분리 후 번들/로드하여 단일 HTML 비대화 방지.
  - API base URL을 환경/설정에서 주입 (예: `window.GRAPHIQ_API_BASE` 또는 빌드 시 치환).
- **인프라**
  - `docker-compose`에 그래프 UI 정적 서버(nginx 등) 추가 시 포트·헬스체크 정리.
  - 필요 시 백엔드 수평 확장(다중 인스턴스) 전제로 Neo4j 연결 풀·상태 비저장 설계 유지.

---

## 2. 유지보수성 (Maintainability)

### 2.1 현재 상태

| 영역 | 상태 | 비고 |
|------|------|------|
| 백엔드 구조 | ✅ | api / core / schemas / services 분리 |
| 그래프 엔드포인트 | ⚠️ | Cypher·비즈니스 로직이 라우터에 집중 |
| 입력 정제 | ⚠️ | `_sanitize_*`가 graph.py·chat.py에 중복 |
| 프론트 구조 | ❌ | graph.html 단일 파일에 HTML+CSS+JS 40개 이상 함수 |
| 스키마 | ⚠️ | 채팅은 Pydantic, 그래프 응답은 raw dict |
| 문서 | ⚠️ | docs 산재, 단일 아키텍처 문서 없음 |

### 2.2 개선 제안

- **백엔드**
  - **공통 유틸**: `app.core.security` 또는 `app.utils.sanitize`에 `sanitize_text(str, max_len)` 등 한 곳에서 정의 후 graph/chat에서 재사용.
  - **그래프 로직 이전**: Cypher 생성·실행·노드/엣지 매핑을 `graph_service` 또는 전용 `graph_repository`로 이동, 라우터는 HTTP·입출력만 담당.
  - **그래프 응답 스키마**: Pydantic 모델로 `NodeOut`, `EdgeOut`, `NodeCountsOut` 정의해 응답 타입·문서화 통일.
- **프론트 (graph.html)**
  - **분리 옵션**  
    - 최소: CSS/JS를 별도 파일로 분리(`graph.css`, `graph.js`)하고 HTML에서 링크.  
    - 권장: 그래프 엔진(레이아웃·렌더·드래그)·API 호출·UI(필터·패널·채팅)를 모듈/네임스페이스로 나누어 한 파일당 300~500줄 이하로 유지.
  - **상수 분리**: `NODE_RADIUS`, `NODE_COLORS`, limit 상수, API 경로를 상단 `config` 객체 또는 별도 `config.js`로 모아 수정 지점을 한 곳으로.
- **문서**
  - `docs/ARCHITECTURE.md`: 시스템 구성도, API 버전 전략, 그래프 데이터 흐름, 프론트 진입점(Streamlit vs graph.html) 역할 정리.
  - `CONTRIBUTING.md`: 로컬 실행, 테스트, 코드 스타일, 브랜치 전략 요약.

---

## 3. 일관성 (Consistency)

### 3.1 현재 상태

| 항목 | 현재 | 문제 |
|------|------|------|
| API 경로 | Streamlit: `/chat`, `/health` / graph.html: `/api/v1/graph/*`, `/api/v1/chat` | 클라이언트별로 버전·경로 불일치 |
| 노드 타입 | 백엔드: `company` 등 / 프론트: `NODE_RADIUS`, `NODE_COLORS`, `activeFilters` 중복 정의 | 타입 추가 시 여러 곳 수정 |
| 입력 검증 | graph: `_sanitize_search`, chat: `_sanitize_question` | 패턴·길이 제한 상이 |
| 에러 메시지 | 한글 메시지 + 영어 키 혼재 | 응답 형식은 유지하되 메시지 정책 정리 필요 |
| limit 기본값 | graph.html: 50·200·500 / backend: 50·100·500 | 프론트·백엔드 불일치 가능성 |

### 3.2 개선 제안

- **API 계약**
  - 모든 새 클라이언트는 `/api/v1`만 사용하도록 권장. Streamlit은 호환 유지 목적으로 기존 경로 유지 시, 내부적으로 `api_router` 한 번만 include 하므로 문서에 “권장 경로: /api/v1” 명시.
  - 그래프·채팅 응답에 `error_code`(선택)·`message` 형식을 맞추어 프론트에서 동일한 방식으로 처리.
- **노드 타입 단일 소스**
  - 백엔드에 `NODE_TYPES = ("company", "person", "major", "institution")` 상수 정의.
  - (선택) `/api/v1/graph/node-types`처럼 타입·라벨·색상 힌트를 반환하고, 프론트는 이를 기반으로 `NODE_RADIUS`/`NODE_COLORS` 생성. 단기에는 프론트 상수 파일을 한 곳으로 모아 백엔드와 목록만 맞추기.
- **입력 정제**
  - `max_length` 등 공통 상수를 config 또는 상수 모듈에 두고, `_sanitize_search`/`_sanitize_question`가 동일한 정제 함수를 호출하도록 통합.
- **limit 정책**
  - 백엔드: `Query(50, ge=1, le=500)` 등 기본·최대를 한 번에 정의.
  - 프론트: `const GRAPH_LIMITS = { nodes: 500, edges: 200 }` 등 한 객체로 관리하고, API 호출 시 이 값 사용.

---

## 4. 우선순위별 액션 요약

| 우선순위 | 액션 | 기대 효과 |
|----------|------|-----------|
| P0 | graph.html에서 상수(limit, API base, 노드 타입)를 상단 config로 분리 | 변경 시 한 곳만 수정, 일관성 확보 |
| P0 | 백엔드 sanitize 공통화 (한 모듈·한 함수) | 유지보수·보안 정책 일관 |
| P1 | 그래프 API 응답에 Pydantic 스키마 도입 | 타입·문서·클라이언트 일관성 |
| P1 | 그래프 Cypher·매핑 로직을 service/repository로 이전 | 라우터 단순화, 테스트·확장 용이 |
| P2 | graph.html을 CSS/JS 분리 또는 모듈 분할 | 가독성·협업·확장성 |
| P2 | docs/ARCHITECTURE.md 작성 | 온보딩·의사결정 일관성 |
| P3 | API base URL을 프론트에서 설정 주입 | 배포 환경별 유연성 |
| P3 | node-counts 등 읽기 전용 API 캐싱 | 응답 시간·서버 부하 완화 |

---

## 5. 정리

- **확장성**: API 버전·설정은 잘 잡혀 있음. limit·캐시·프론트 번들 분리로 확장 여지 확보 권장.
- **유지보수성**: 백엔드 레이어 분리는 좋음. 그래프 로직·sanitize·스키마를 정리하고, graph.html은 분리 또는 모듈화하면 유지보수성이 크게 개선됨.
- **일관성**: API 경로·노드 타입·입력 정제·limit을 “한 곳 정의, 다수 사용”으로 맞추면 일관성과 변경 비용이 동시에 개선됨.

이 문서는 의사결정과 리팩터링 우선순위 참고용으로 사용하시면 됩니다.
