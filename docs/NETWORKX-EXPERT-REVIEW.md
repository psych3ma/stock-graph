# NetworkX 전문가 관점 검토: GraphIQ 그래프 구조·레이아웃

**대상**: GraphIQ — Neo4j + FastAPI 백엔드, Vanilla JS 프론트(커스텀 force 레이아웃)  
**관점**: NetworkX의 그래프 표현·알고리즘·레이아웃과 비교하여 부족한 점·개선 방향 정리

---

## 1. 현재 구조 vs NetworkX 관점

### 1.1 그래프 표현

| 항목 | 현재 (GraphIQ) | NetworkX 관점 |
|------|----------------|---------------|
| **구조** | `NODES[]`, `EDGES[]` 별도 배열. 노드 `{id, type, label, ...}`, 엣지 `{from, to, type, ratio, label}` | 단일 `G` 객체 (노드/엣지 일원화). `G.add_nodes_from()`, `G.add_edges_from()` 또는 `nx.from_edgelist()` |
| **방향성** | 엣지에 `from`→`to` 존재 (유향). 컴포넌트 탐지는 무향 BFS | 유향이면 `nx.DiGraph`, 약한 연결은 `nx.weakly_connected_components` |
| **다중 엣지** | 동일 (from, to) 쌍에 여러 행(ratio별). 프론트에서 번들링 | `G.add_edge(u, v, ratio=r)` 또는 MultiDiGraph. `G.number_of_edges(u, v)` |
| **가중치** | `ratio` 필드. 레이아웃에서 “목표 거리”에만 사용 | `weight` 속성. `nx.spring_layout(G, weight='weight')` 등으로 표준 지원 |

**정리**: “그래프 객체”가 없고 노드/엣지가 분리되어 있어, NetworkX로 치면 `G = nx.DiGraph()` 한 번 만든 뒤 `add_edges_from` 하는 단계가 프론트/백엔드에 흩어져 있음. 다중 엣지·가중치는 있으나 그래프 API로 일원화되어 있지 않음.

---

### 1.2 연결 요소 (Connected Components)

**현재**: `getConnectedComponents(nodes, edges)` — 인접 리스트 구성 후 BFS, 무향 처리.

```javascript
// graph.js:616–636 — BFS, comp 크기로 정렬
```

**NetworkX 대응**:
- 무향: `nx.connected_components(G)`
- 유향: `nx.weakly_connected_components(G)` (현재 시각화는 무향처럼 쓰므로 이쪽에 가깝다)

**평가**: 로직은 표준 BFS로 적절. 다만 백엔드에서 동일 결과가 필요하면 Neo4j에서 컴포넌트 쿼리 또는 Python에서 NetworkX로 검증/재사용 가능.

---

### 1.3 차수 (Degree)

**현재**: `nodeDegrees.set(n.id, EDGES.filter(...).length)` — 매 노드마다 엣지 순회.

**NetworkX**: `G.degree(n)` 또는 `dict(G.degree())`, `nx.degree_centrality(G)`.

**평가**: 구현은 O(E)로 문제 없음. 다만 “그래프”가 한 객체로 있으면 `G.degree()` 한 번으로 일괄 계산 가능.

---

## 2. 레이아웃 알고리즘 비교

### 2.1 현재: 커스텀 Force-Directed

- **초기 배치**: 컴포넌트별 그리드 셀 + 원형 배치(각도·반경), 노드 수에 비례한 반경.
- **힘**:
  - 반발: 거리 기반 (충돌 반경 내·repulsionRange 내), 차수 보정(`repulsionDegreeFactor`).
  - 스프링: 엣지당 목표 길이 = f(ratio, 차수), `idealDistBaseLengthForInverseSqrt` 등.
  - 워밍업: 처음 N스텝은 링크 없이 반발만.
- **충돌**: `getLayoutRadius(node)`(원+라벨) 기준 분리.

→ **Fruchterman–Reingold(FR)와 유사하나**, FR의 표준 공식(attraction = d²/k, repulsion = k²/d)과는 다름. “반발 강하게 + 링크 약하게 + ratio로 목표 길이 차등”이라는 **커스텀 변형**에 가깝다.

### 2.2 NetworkX 제공 레이아웃

| 레이아웃 | 특징 | GraphIQ와의 관계 |
|----------|------|------------------|
| **spring_layout** | Fruchterman–Reingold. `weight`로 엣지 강도 반영 가능 | 개념적으로 가장 가깝다. 현재는 weight=ratio를 “목표 거리”로만 쓰고, FR의 k/scale은 없음. |
| **kamada_kawai_layout** | 거리 기반 스트레스 최소화. 작은 그래프에 안정적 | 현재 미사용. 초기 배치·수렴 품질 개선 시 후보. |
| **spectral_layout** | Laplacian 고유벡터. 커뮤니티가 공간상 구분될 수 있음 | 미사용. 구조적 분리 강조 시 고려. |
| **shell_layout** | 동심원/계층. | Ego/계층 모드와 일부 유사. |

**정리**: 현재는 “spring + ratio 기반 목표 길이 + 차수 기반 반발”이라는 **자체 스펙**으로 잘 정의되어 있으나, NetworkX의 `spring_layout(G, weight='ratio', k=...)`와 수식/파라미터 수준의 대응 관계는 없음.

---

## 3. NetworkX 전문가 관점의 개선 제안

### 3.1 백엔드에서 NetworkX 도입 (선택)

**목적**: 레이아웃·메트릭을 서버에서 한 번에 계산해 프론트 부담 감소·일관성 확보.

- **의존성**: `requirements.txt`에 `networkx` 추가.
- **그래프 구성**: `/graph` 또는 `/nodes`+`/edges` 응답을 받아 `G = nx.DiGraph()` (또는 `Graph`)로 구성.  
  - 노드: `G.add_nodes_from([(n['id'], n) for n in nodes])`  
  - 엣지: `G.add_edges_from([(e['from'], e['to'], {'ratio': e['ratio']}) for e in edges])`
- **레이아웃 API 예시**:
  - `GET /api/v1/graph/layout?nodes=...&edges=...` (또는 기존 nodes/edges 재사용)
  - 내부: `pos = nx.spring_layout(G, weight='ratio', k=1/sqrt(ratio), ...)` 또는  
    `pos = nx.kamada_kawai_layout(G)` (작은 그래프)
  - 응답: `{ "positions": { "n123": { "x": 0.5, "y": 0.3 }, ... } }` (0–1 정규화 권장)
- **컴포넌트**: `list(nx.weakly_connected_components(G))`로 컴포넌트 ID를 응답에 넣으면, 프론트의 `getConnectedComponents`와 교차 검증 가능.

**장점**: 레이아웃 품질을 Python 쪽에서 통제·튜닝 가능; 프론트는 “위치 받아서 그리기”만 담당.  
**단점**: 대량 노드 시 레이아웃 API 지연, 캐시/비동기 전략 필요.

---

### 3.2 프론트: 그래프 “뷰 모델” 도입 (권장)

- **현재**: `NODES`, `EDGES`, `positions`가 전역으로 흩어져 있음.
- **제안**:  
  - `buildGraphFromNodesAndEdges(NODES, EDGES)` → `{ nodes: Map(id→node), edges: Array, adjacency: Map(id→Set(neighbor)) }`  
  - 컴포넌트·차수·가중치 집계를 이 객체 기반으로 한 곳에서 계산.  
  - 레이아웃은 “이 그래프 객체 + extent”만 받아서 `positions`를 채움.

NetworkX는 “G” 하나로 위 연산을 제공하므로, 프론트에도 **단일 그래프 뷰**가 있으면 알고리즘 이식·테스트가 쉬워짐.

---

### 3.3 레이아웃 알고리즘 정책 명시

- **현재**: “커스텀 force + 반발 워밍업 + ratio 기반 스프링”.
- **문서화 권장**:  
  - “Fruchterman–Reingold 계열이 아니라, 반발/스프링 식이 다음과 같다”는 한 줄 스펙을 `LAYOUT_CONFIG` 위나 `docs/`에 두기.  
  - 나중에 백엔드에서 `spring_layout`을 쓸 경우, **같은 weight(ratio) 해석**을 맞추기 (예: “ratio 높을수록 거리 짧게”를 둘 다 동일 규칙으로).

---

### 3.4 엣지 가중치(ratio)의 일관된 해석

- **현재**: `idealDist = f(ratio, degree)` (역제곱근 옵션 등).  
- **NetworkX 관점**: `weight`는 보통 “강도”(크면 당김 강함) 또는 “거리”(크면 멀리).  
- **제안**:  
  - “ratio = 지분% → 시각적 거리는 1/sqrt(ratio)에 비례”를 프로젝트 공식 규칙으로 고정.  
  - 백엔드에서 `spring_layout(..., weight='ratio')`를 쓰면, NetworkX는 weight가 클수록 “더 당김”으로 해석하므로, **거리**로 쓰려면 `weight=1/ratio` 또는 `1/sqrt(ratio)`로 넘기는 식으로 맞출 것.

---

## 4. 체크리스트 (NetworkX 관점)

| 항목 | 현재 | 권장 |
|------|------|------|
| 그래프 객체 일원화 | NODES/EDGES 분리 | 프론트에 그래프 “뷰”(노드/엣지/인접) 한 번 만든 뒤 레이아웃·렌더가 참조 |
| 연결 요소 | BFS (무향) | 유지. 필요 시 백엔드에서 `nx.weakly_connected_components`로 검증 또는 제공 |
| 레이아웃 | 커스텀 force | 유지 가능. 문서로 “FR 변형 + ratio·차수 반영” 명시. 대안으로 백엔드 `spring_layout`/`kamada_kawai` 검토 |
| 가중치(ratio) | 목표 거리 계산에만 사용 | “ratio ↔ 시각적 거리” 규칙을 한 줄로 고정하고, 백엔드 레이아웃 시 동일 규칙 사용 |
| 다중 엣지 | 프론트 번들링 | 유지. 백엔드가 집계해 주면 NetworkX는 `G.add_edge(u,v, ratio=..., count=...)` 한 행으로 표현 가능 |

---

## 5. 요약

- **구조**: 노드/엣지가 배열로만 있어 “그래프”가 명시적이지 않음. NetworkX처럼 **한 그래프 뷰**를 두면 컴포넌트·차수·레이아웃 입력이 단순해짐.
- **레이아웃**: 현재 커스텀 force는 합리적이나, Fruchterman–Reingold의 표준 식과는 다름. **문서로 스펙 고정**하고, 필요 시 백엔드에서 `spring_layout`/`kamada_kawai`로 보조 또는 대체 검토.
- **백엔드 NetworkX**: 선택 사항. 레이아웃·컴포넌트를 서버에서 계산해 주면 프론트는 렌더만 담당할 수 있고, NetworkX의 검증된 알고리즘과 동일한 weight/component 해석을 쓸 수 있음.

**파일**: 검토만 반영 시 코드 변경 없음. 반영 시에는 `backend/requirements.txt`(networkx), `backend` 레이아웃 엔드포인트, `frontend/graph.js`의 그래프 뷰/초기 배치 소스 정리.

---

## 6. 적용 내역 (CTO 우선순위 반영)

| 우선순위 | 항목 | 적용 내용 |
|----------|------|-----------|
| **P0** | Backend NetworkX + 레이아웃 API | `requirements.txt`에 networkx 추가. `app/services/layout_service.py` (compute_layout, nx.DiGraph, weakly_connected_components, spring_layout). `POST /api/v1/graph/layout` (LayoutRequest/Response 스키마). |
| **P1** | 컴포넌트·그래프 구성 | layout_service에서 G 구성 후 `nx.weakly_connected_components(G)`, 컴포넌트별 서브그래프 spring_layout 후 그리드 배치. |
| **P2** | 프론트 그래프 뷰 모델 | `buildGraphView(NODES, EDGES, activeFilters)` 도입. allNodes, nodeDegrees, maxDegree, components, idToNode 반환. initPositions에서 단일 소스로 사용. |
| **P3** | 서버 레이아웃 선택 사용 | `GRAPH_CONFIG.useServerLayout: true`. loadGraph에서 buildGraphView → fetchServerLayout(노드/엣지, 뷰포트) 호출, 성공 시 positions 적용 후 initPositions 스킵. 실패 시 클라이언트 force 폴백. |
| **P4** | ratio 규칙·레이아웃 정책 문서화 | `graph.js` LAYOUT_CONFIG 상단 주석: "ratio → 시각적 거리, 서버 weight=ratio / 클라이언트 idealDist ∝ 1/√ratio". `layout_service.py` docstring 동일 규칙 명시. |
