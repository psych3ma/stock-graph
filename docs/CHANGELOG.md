# 변경 이력 (Changelog)

**최종 업데이트**: 2026-02-18  
**목적**: 주요 수정 사항을 시간순으로 기록 (레거시 문서 통합)

---

## 2026-02-18: NetworkX 레이아웃 + 털뭉치 해소

- **백엔드**: NetworkX 도입 (`requirements.txt`), `POST /api/v1/graph/layout` API 추가
- **레이아웃**: MultiDiGraph → 단순 Graph 변환, Kamada-Kawai → Spring 2단계, seed=42 고정
- **프론트**: `buildGraphView()` 그래프 뷰 모델, 서버 레이아웃 선택 사용 (`useServerLayout`), 결정론적 폴백
- **문서**: `NETWORKX-EXPERT-REVIEW.md`, `CTO-LAYOUT-HAIRBALL-FIX.md` 추가

---

## 2026-02-17: 초기 배치·물리 엔진 개선

- **레이아웃**: 반발 워밍업(180 iter), repulsionStrength 280, collisionRadiusMultiplier 3.5, edgeForce 0.022
- **초기 배치**: 노드 수 기반 반경(`comp.length * 16`), 최소 레이아웃 공간 700×500, 뷰포트 준비 대기
- **렌더링**: 시뮬 중 실시간 렌더링(매 배치 후), 결정론적 폴백 위치
- **문서**: `CTO-REVIEW-INITIAL-PLACEMENT-AND-PHYSICS.md` 추가

---

## 2026-02-17: 엣지 번들링·좌표 정밀도

- **엣지**: 동일 (from, to) 그룹화, 단일 엣지는 line, 다중은 path Q 곡선, 레이블 "N% (M건)"
- **좌표**: 반올림 없이 물리 엔진 소수점 그대로 사용 (`c(v) = Number(v)`)
- **구조**: `<g class="edge-container" data-source="..." data-target="...">` 추가

---

## 2026-02-17: QA 이슈 수정 (7건)

- API 타임아웃, XSS 검증, 빈 레이블 처리, 엣지 렌더링 피드백, 동시성 문제, 빈 응답 처리, 중복 요청 방지
- 상세: `QA-ISSUES-GRAPH-VISUALIZATION.md` 참고

---

## 레거시 문서

과거 수정 이력은 `docs/archive/` 폴더에 보관:
- `FIXES_SUMMARY.md`, `CTO_FIXES_SUMMARY.md`, `CTO_FIXES_COMPLETE.md`, `FIXES_APPLIED.md`
- `CTO_PRIORITY_FIXES.md`, `CTO_COMPREHENSIVE_REVIEW.md`, `CTO_ANALYSIS.md`

---

## 현재 활성 문서

- **`QA-ISSUES-GRAPH-VISUALIZATION.md`**: QA 이슈 추적 (해결 현황 포함)
- **`QA-BACKEND-FRONTEND-ISSUES.md`**: 백엔드/프론트 이슈 리스트
- **`NETWORKX-EXPERT-REVIEW.md`**: NetworkX 전문가 검토 + 적용 내역
- **`CTO-LAYOUT-HAIRBALL-FIX.md`**: 털뭉치 해소 수정 내역
- **`CTO-REVIEW-*.md`**: 각종 CTO 검토 문서 (최신 상태)
