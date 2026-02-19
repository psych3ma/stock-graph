# 레거시 코드 정리 (CTO 관점)

**정리 일자**: 2026-02-18  
**목적**: 사용되지 않는 코드·중복 문서 제거, 협업 코드 유지보수성 향상

---

## 1. 제거된 코드

| 항목 | 위치 | 이유 |
|------|------|------|
| `eventListeners` WeakMap | `frontend/graph.js:969` | 선언만 되고 사용되지 않음. `innerHTML` 교체로 이벤트 리스너가 자동 제거되므로 추적 불필요. |
| 레거시 주석 | `frontend/graph.js:978-980` | "이벤트 리스너 정리" 주석 제거 (코드만으로 명확). |

---

## 2. 아카이브된 문서 (docs/archive/)

| 파일 | 내용 | 아카이브 이유 |
|------|------|---------------|
| `FIXES_SUMMARY.md` | QA 이슈 7건 수정 내역 | `QA-ISSUES-GRAPH-VISUALIZATION.md`에 최신 상태 반영됨 |
| `CTO_FIXES_SUMMARY.md` | CTO 이슈 2건 수정 내역 | 중복, `CHANGELOG.md`로 통합 |
| `CTO_FIXES_COMPLETE.md` | CTO 이슈 상세 보고서 | 중복, `CHANGELOG.md`로 통합 |
| `FIXES_APPLIED.md` | 첫 화면 UX 수정 | 초기 수정 내역, `CHANGELOG.md`로 통합 |
| `CTO_PRIORITY_FIXES.md` | 우선순위별 수정 | 중복 |
| `CTO_COMPREHENSIVE_REVIEW.md` | 종합 검토 | 최신 검토는 `CTO_REVIEW.md` 등에 반영 |
| `CTO_ANALYSIS.md` | CTO 분석 | 최신 분석은 각 `CTO-REVIEW-*.md`에 분산 |

**정리 후**: 32개 활성 문서, 7개 아카이브.

---

## 3. 현재 활성 문서 구조

### 핵심 문서 (최신 상태 유지)
- **`QA-ISSUES-GRAPH-VISUALIZATION.md`**: QA 이슈 추적 (해결/미해결)
- **`QA-BACKEND-FRONTEND-ISSUES.md`**: 백엔드/프론트 이슈 리스트
- **`NETWORKX-EXPERT-REVIEW.md`**: NetworkX 검토 + 적용 내역
- **`CTO-LAYOUT-HAIRBALL-FIX.md`**: 털뭉치 해소 수정
- **`CHANGELOG.md`**: 시간순 변경 이력 (레거시 문서 통합)

### 검토 문서 (참고용)
- `CTO-REVIEW-*.md`: 각종 CTO 검토 (레이아웃, NaN, 라벨, Neo4j 등)
- `NEO4J_REVIEW*.md`: Neo4j 스키마/쿼리 검토
- `UX_*.md`: UX 검토

---

## 4. 협업 코드 원칙 (정리 후)

- **단일 소스**: 중복 문서 제거, `CHANGELOG.md`로 통합
- **명확한 구조**: 활성 문서만 `docs/`, 과거 이력은 `docs/archive/`
- **사용되지 않는 코드 제거**: `eventListeners` WeakMap 등 미사용 변수/함수 정리
- **주석 최소화**: 코드로 명확하면 주석 제거 (예: `innerHTML` 교체는 이벤트 리스너 자동 제거)

---

## 5. 향후 정리 권장

| 항목 | 우선순위 | 비고 |
|------|----------|------|
| 테스트 파일 정리 | P2 | `test_*.py`, `check_*.py` 중 사용되지 않는 스크립트 확인 |
| Streamlit 프론트 | P3 | `frontend/main.py`, `frontend/src/` — 현재 `graph.html`만 사용 중인지 확인 |
| 환경변수 정리 | P2 | `.env.example`에 사용되지 않는 변수 확인 |
