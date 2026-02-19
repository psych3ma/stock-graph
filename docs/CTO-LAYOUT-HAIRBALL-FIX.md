# CTO 검토: "털뭉치" 레이아웃 수정 (NetworkX 전문가 조언 반영)

**현상**: Force-directed는 돌지만 파라미터·데이터 전처리 부족으로 노드가 착 달라붙어 "별자리"가 아닌 "털뭉치"처럼 보임.

---

## 1. 진단 (전문가 3가지)

| 원인 | 설명 | 조치 |
|------|------|------|
| **MultiDiGraph 함정** | 동일 (A,B) 관계가 여러 건(지분·대출 등)이면 다중 엣지가 스프링 강도를 N배로 만들어 노드가 붙음 | 레이아웃용 **단순 Graph**, 노드 쌍당 엣지 1개, weight=max(ratio) |
| **k 부재** | 노드 간 적정 거리가 없거나 너무 작음 | k = 5.0/√n 동적 설정 (별자리 느낌) |
| **비결정론** | 새로고침/환경마다 모양이 달라 협업 시 "이 노드 보세요" 공유 불가 | **seed=42** 고정, 폴백 위치도 id 기반 결정론 |

---

## 2. 적용한 파이프라인 (협업 코드)

**입력 정제 → 단순 그래프 → 1차 Kamada-Kawai → 2차 Spring → 0~1 정규화**

- **단순 그래프**: `_build_layout_graph()` — (from, to) 쌍당 엣지 1개, `weight=max(ratio)`.
- **1차 레이아웃**: `nx.kamada_kawai_layout(G, scale=1.0)` — 골격·그룹 분리.
- **2차 레이아웃**: `nx.spring_layout(G, pos=pos, k=5.0/√n, iterations=30, seed=42)` — 미세 조정, 뭉침 완화.
- **정규화**: `_normalize_positions()` — [padding, 1-padding] 범위로 Frontend 계약(0~1) 맞춤.
- **컴포넌트**: 연결 요소별로 위 2단계 수행 후 그리드 배치 (기존 유지).

---

## 3. 변경 파일

| 파일 | 내용 |
|------|------|
| `backend/app/services/layout_service.py` | `_build_layout_graph` (Graph, 쌍당 1엣지), `_layout_one_graph` (Kamada-Kawai → Spring), `_normalize_positions`, `LAYOUT_SEED=42` |
| `frontend/graph.js` | position 없을 때 폴백: `hashId(n.id)` 기반 각도·반경으로 **결정론적** 배치 |

---

## 4. Frontend 엣지 번들링 (기존 유지)

NetworkX는 좌표만 제공. "지저분한 선"은 프론트 렌더링 이슈이므로:

- 동일 (from, to) 엣지는 이미 **번들링** (1선 또는 path Q 곡선 분리).
- 레이블 "N% (M건)" 표시.

추가로 엣지 곡률·굵기 정책은 `graph.js` 쪽에서만 조정하면 됨.

---

## 5. 협업·UX 요약

- **결정론적 레이아웃**: 동일 데이터 → 동일 좌표 (seed=42, 결정론적 폴백).
- **캐싱 권장**: 노드 100개 이상 시 `kamada_kawai` 비용이 있으므로, 한 번 계산한 positions를 DB/Redis에 저장해 재사용 권장 (별도 구현).
