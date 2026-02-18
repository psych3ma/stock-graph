# CTO 검토: Neo4j 전문가 제안 시각화 해결방안

**검토일**: 2025-02  
**대상**: 첨부 자료 — Supernode/순환출자 진단, 엣지 가중치, Cypher 가지치기, 차수 기반 반발력, 사이클 확장력

---

## 1. 제안 요약 vs 현재 구현

| 제안 | 내용 | 현재 코드 상태 | 판단 |
|------|------|----------------|------|
| **엣지 가중치 (지분율 기반 목표 길이)** | 높은 지분 = 짧은 엣지, 낮은 지분 = 긴 엣지. 수식: `L_edge = 1/sqrt(share_percent)` | **이미 구현됨(선형)** — `baseIdeal = idealMax - (ratio/100)*(idealMax-idealMin)`, 차수 보정 `idealDist *= 1+(degFrom+degTo)*0.2` | **보강 권장**: 선형 → 역제곱근(1/√ratio) 옵션 추가 시 “주요 지배 관계는 가깝게, 소액 지분은 멀리”가 더 뚜렷해짐 |
| **Cypher 단계 가지치기** | 초기 로딩 시 지분 1% 미만/저중요 관계 제외. 예: `WHERE r.share > 5` | **미구현** — `/edges` 쿼리에 `stockRatio` 필터 없음. `ORDER BY r.stockRatio DESC LIMIT $limit` 만 사용 | **적용 권장** — API에 `min_ratio`(또는 `share_min`) 쿼리 파라미터 추가, 백엔드/프론트 기본값(예: 1 또는 5) 합의 |
| **차수 기반 반발력** | `Node_Repulsion = BASE_REPULSION * (1 + node.degree * 0.5)` — 허브가 더 넓은 자리 요구 | **일부만 구현** — 차수는 **스프링 목표 길이(idealDist)** 에만 반영됨. **반발력(repulsionStrength)** 은 모든 노드 동일 | **적용 권장** — 반발력/충돌 반경을 차수에 비례해 키우면 슈퍼노드 주변 뭉침 완화 |
| **사이클 탐지 + 확장력** | `apoc.algo.allSimplePaths` 등으로 순환 출자 탐지 후, 사이클 내 노드에 “확장력” 부여 | **미구현** — 백엔드에 APOC 의존·사이클 API 없음, 프론트에 확장력 로직 없음 | **2단계 검토** — 효과 큼 but 백엔드 스키마/APOC·성능 이슈 검토 후 도입 |

---

## 2. 제안별 CTO 판단

### 2.1 엣지 가중치 (Edge Weighting) — L = 1/√(share_percent)

- **의도**: 지배 구조가 시각적으로 명확해지도록 — 고지분 관계는 짧게, 소액은 길게.
- **현재**: 선형 보간 `idealMin ~ idealMax` by ratio. 이미 “높은 ratio = 짧게” 방향은 맞음.
- **제안 수식**: `L_edge = 1/sqrt(share_percent)` → ratio가 작을수록 L이 크게 늘어나서, 소액 지분이 주변으로 밀려나는 효과가 강해짐.
- **리스크**: ratio가 0에 가까우면 L이 폭발하므로 상·하한(clamp) 필요. (예: ratio 0.1~100 구간만 사용.)
- **권장**:  
  - **Option A**: `idealDist` 계산 시 “역제곱근 모드” 추가.  
    - 예: `baseIdeal = baseLength / Math.sqrt(Math.max(0.1, ratio))` 형태로 하고, `idealMin/Max`로 clamp.  
  - **Option B**: 기존 선형 유지하고, `idealDistMin/Max` 범위를 더 넓혀서(예: 200~1000) 저지분 엣지를 더 길게만 두기.  
  - CTO 권장: **Option A**를 설정 플래그(예: `useInverseSqrtEdgeLength: true`)로 넣고, A/B 테스트 가능하게 하는 쪽이 유연함.

---

### 2.2 Cypher 단계 데이터 가지치기 (min_ratio)

- **의도**: 시각화 초기 로딩 시 노이즈(저지분 관계) 제거 → 렌더 객체 수 감소, 뭉침 완화.
- **현재**: `/edges` 에서 `WHERE $ids IS NULL OR id(s) IN $ids OR id(c) IN $ids` 만 있고, `r.stockRatio` 필터 없음.
- **권장**:
  - **백엔드**: `get_edges(..., min_ratio: Optional[float] = Query(None, description="최소 지분율(%)"))` 추가.  
    - `WHERE ($min_ratio IS NULL OR r.stockRatio >= $min_ratio)` (및 기존 id 조건) 적용.  
    - 기본값은 `None`(기존 동작 유지) 또는 1.0/5.0 중 정책 결정.
  - **프론트**: 초기 `loadGraph()` 호출 시 쿼리 파라미터에 `min_ratio=5`(또는 설정값) 전달. 사용자 옵션(예: “5% 미만 숨기기”)으로 확장 가능.
- **리스크**: 낮음. 기존 클라이언트는 파라미터 없이 호출하면 동작 동일.

---

### 2.3 노드 가중치 기반 반발력 (Degree-based Repulsion)

- **의도**: “연결 많은 지주회사 = 더 넓은 자리 필요” → 슈퍼노드 주변 뭉침 해소.
- **현재**: `repulsionStrength`, `collisionRadius = (r+otherR)*collisionMult` 가 노드별로 동일. 차수는 스프링 `idealDist`에만 사용됨.
- **제안**: `Node_Repulsion = BASE_REPULSION * (1 + node.degree * 0.5)`.
- **권장**:
  - **반발력(또는 충돌 반경)을 차수에 비례**하게 변경.  
    - 예: `effectiveRepulsion = cfg.repulsionStrength * (1 + (nodeDegrees.get(n.id)||0) * 0.5)`  
    - 또는 “물리 반지름”을 차수에 따라 추가 확대: `r_effective = getLayoutRadius(n) * (1 + degreeFactor * degree)` (레이아웃 전용).
  - 상수 `0.5`는 `LAYOUT_CONFIG.force.repulsionDegreeFactor` (또는 유사 이름)로 두고 튜닝 가능하게.
- **리스크**: 낮음. 기존 force 구조 그대로 두고 계수만 노드별로 바꾸면 됨.

---

### 2.4 순환 출자(Cycle) 탐지 + 확장력 (Expansion Force)

- **의도**: 4~5각형으로 뭉치는 것이 실제 순환 출자 구조일 수 있으므로, 사이클 내 노드에 “확장력”을 줘서 펼쳐 보이게 함.
- **현재**: 미구현. Neo4j APOC 사용 쿼리·전용 API 없음.
- **고려사항**:
  - **백엔드**: APOC 의존성·버전 호환, `allSimplePaths` 등 대용량 그래프에서의 비용(타임아웃/메모리).
  - **프론트**: 사이클 노드 ID 목록을 받아, 해당 노드에만 “중앙에서 밖으로 밀어내는” 힘 추가.
- **권장**:  
  - **1단계**: 2.1~2.3(엣지 가중치 보강, min_ratio, 차수 기반 반발력) 적용 후 재현 테스트로 효과 확인.  
  - **2단계**: 효과가 부족한 구간(특히 “순환 구조가 명확한 서브그래프”)만 타깃으로,  
    - 백엔드에 “사이클 탐지(제한된 depth/hops)” 전용 API 추가 검토,  
    - 프론트에 “사이클 노드 집합 + 확장력” 적용.  
  - APOC 미사용 시: “강한 양방향 연결(같은 쌍 간 다중 관계/높은 지분)” 휴리스틱으로 사이클 유사 노드 집합을 근사하는 방법도 후보.

---

## 3. 구현 우선순위 권장

| 순서 | 항목 | 담당 | 비고 |
|------|------|------|------|
| 1 | **Cypher min_ratio** (백엔드 + 프론트 옵션) | Backend + Frontend | 빠르게 노이즈 감소·성능 개선 |
| 2 | **차수 기반 반발력** (effectiveRepulsion or r_effective by degree) | Frontend | 슈퍼노드 뭉침 완화, 코드 변경 국소적 |
| 3 | **엣지 목표 길이 역제곱근 옵션** (1/√ratio 모드) | Frontend | 설정 플래그로 도입 후 A/B 가능 |
| 4 | **사이클 탐지 + 확장력** | Backend + Frontend | 1~3 적용·QA 후, 필요 시 2단계에서 설계 |

---

## 4. 적용 후 QA 이슈 리스트 반영

- 위 1~3 적용 후, **docs/QA-ISSUES-GRAPH-VISUALIZATION.md** 를 다음 기준으로 재검사·업데이트 권장:
  - 라벨/화살표 겹침, “한쪽 구석에만 그려짐”, 슈퍼노드 주변 4~5각형 뭉침이 **해소·완화**되었는지 확인.
  - 신규 이슈: min_ratio로 인한 “일부 관계가 안 보임” UX(필터 안내/설정 노출), 역제곱근 모드 시 극단 ratio 구간 시각 검증.

이 문서는 “Neo4j 전문가 제안 해결방안”에 대한 CTO 검토용이며, 적용 후 QA 리스트는 별도로 재검사된 내용으로 갱신할 예정임.
