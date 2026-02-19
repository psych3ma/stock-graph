# CTO 관점: 밀집 그래프 시각화 검토 및 코드 위치 파악

**검토 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드  
**이슈**: 그래프 노드 밀집도가 과도하여 가독성 및 사용성 저하

---

## 🔍 발견된 문제

### 1. 노드 밀집도 과다 (Critical)

**현상**:
- 수천 개의 노드가 겹쳐서 표시됨
- 개별 노드 구분 불가능
- 연결 관계 파악 불가능
- 정보 추출 불가능

**영향**:
- 🔴 **사용성 심각 저하**: 그래프 탐색 불가능
- 🔴 **성능 이슈 가능성**: 렌더링/인터랙션 성능 저하
- ⚠️ **데이터 가치 상실**: 시각화 목적 달성 불가

**CTO 관점 분석**:
- **확장성**: 대용량 데이터 처리 전략 부재
- **유지보수성**: 레이아웃 알고리즘 개선 필요
- **일관성**: 노드 크기/간격 일관성 부족
- **호환성**: 브라우저 성능 한계 고려 필요
- **협업 코드**: 레이아웃 로직 문서화 필요

---

## 📍 코드 위치 파악

### 1. 그래프 레이아웃 계산

#### 위치: `frontend/graph.js`

**주요 함수**:

1. **`initPositions()`** (라인 1047-1304)
   - **역할**: 노드 위치 초기화 및 Force-directed 레이아웃 계산
   - **알고리즘**: 
     - 서버 레이아웃 우선 시도 (`fetchServerLayout()` - 라인 357)
     - 실패 시 클라이언트 Force-directed 레이아웃
   - **현재 상태**: 
     - ✅ `LAYOUT_CONFIG.force` 파라미터 사용 (라인 51-75)
     - ✅ `minDist: 800` 설정 (라인 54)
     - ✅ `repulsionStrength: 600` 설정 (라인 56)
     - ✅ 노드 수에 비례한 반경 확대 (라인 1105, 1088)
   - **문제점**: 
     - ⚠️ 대용량 데이터(4000+ 노드)에서도 충분하지 않을 수 있음
     - ⚠️ Force simulation 반복 횟수 제한 (`maxIter: 1200`)

```javascript
// 라인 1047-1304
function initPositions() {
  // Force-directed 레이아웃 계산
  const cfg = LAYOUT_CONFIG.force;
  const minDist = cfg.minDist; // 800
  const repulsionRange = minDist * cfg.repulsionRange; // 6.0
  // Force simulation 실행
}
```

2. **`fetchServerLayout()`** (라인 357-383)
   - **역할**: 서버 측 PyGraphviz 레이아웃 요청
   - **API**: `/api/v1/graph/layout`
   - **문제점**: 
     - 서버 레이아웃 실패 시 클라이언트 레이아웃으로 폴백
     - 서버 레이아웃도 밀집도 문제 가능성

3. **`buildGraphView()`** (라인 1033-1045)
   - **역할**: 필터링된 노드 뷰 생성
   - **문제점**: 
     - 필터링 후에도 노드 수가 많을 수 있음

---

### 2. 그래프 렌더링

#### 위치: `frontend/graph.js`

**주요 함수**:

1. **`renderGraphWithVisJs()`** (라인 1410-1751)
   - **역할**: Vis.js를 사용한 그래프 렌더링
   - **설정**: `GRAPH_CONFIG`, `LAYOUT_CONFIG` 사용
   - **현재 상태**: 
     - ✅ 동적 노드 크기 계산 (`calculateNodeSize()` - 라인 175)
     - ✅ 줌 레벨 기반 라벨 표시 (라인 1550-1571)
     - ✅ 초기 뷰 제한 기능 (`INITIAL_VIEW_CONFIG` - 라인 43-49)
     - ⚠️ **Physics 비활성화**: `physics: { enabled: false }` (라인 1701)
     - ⚠️ **고정 좌표 사용**: `fixed: { x: true, y: true }` (라인 1578)
   - **문제점**: 
     - 🔴 **Physics 비활성화로 인한 밀집도 문제**: Vis.js의 자동 레이아웃 기능 미사용
     - ⚠️ 서버/클라이언트 레이아웃 계산된 좌표를 그대로 사용
     - ⚠️ 대용량 데이터에서 레이아웃 알고리즘 한계

```javascript
// 라인 1701
physics: { enabled: false }, // PyGraphviz 좌표 고정 (물리 엔진 비활성화)

// 라인 1578
fixed: { x: true, y: true }, // PyGraphviz 좌표 고정
```

**핵심 이슈**: 
- 레이아웃은 `initPositions()`에서 계산되지만, 대용량 데이터(4000+ 노드)에서 충분하지 않을 수 있음
- Vis.js physics가 비활성화되어 있어서 실시간 레이아웃 조정 불가능

---

### 3. 노드/엣지 스타일링

#### 위치: `frontend/graph.js`

**주요 함수**:

1. **노드 생성** (라인 1523-1604, `renderGraphWithVisJs()` 내부)
   - **역할**: Vis.js 노드 데이터 생성
   - **스타일**: 노드 타입별 색상 적용
   - **현재 상태**: 
     - ✅ 동적 노드 크기 계산 (`calculateNodeSize()` - 라인 1531)
     - ✅ 연결 수 및 지분율 기반 크기 조정 (라인 175-238)
     - ✅ 줌 레벨 기반 라벨 표시 (라인 1550-1571)
     - ✅ 중요도 기반 라벨 필터링 (라인 1562)
   - **문제점**: 
     - ⚠️ 밀집도에 따른 크기 조정은 있지만, 레이아웃 레벨에서 해결 필요

```javascript
// 라인 1531
const nodeSize = calculateNodeSize(n, visibleEdges, selectedNodeId, connectedNodeIds);

// 라인 175-238
function calculateNodeSize(node, edges, selectedNodeId, connectedNodeIds) {
  // 연결 수 및 지분율 기반 크기 계산
  // 밀집도 고려는 레이아웃 레벨에서 처리 필요
}
```

2. **엣지 생성** (라인 1626-1681, `renderGraphWithVisJs()` 내부)
   - **역할**: Vis.js 엣지 데이터 생성
   - **스타일**: 연결 관계별 색상/두께 적용
   - **현재 상태**: 
     - ✅ 줌 레벨 기반 라벨 표시 (라인 1655)
     - ✅ 중요도 기반 필터링 (라인 1660)
     - ✅ 연결 상태별 색상/투명도 (라인 1665-1667)

---

### 4. 범례 컴포넌트

#### 위치: `frontend/graph.html`, `frontend/graph.js`

**HTML 구조** (`graph.html:149-173`):
```html
<div class="graph-legend" id="legend">
  <div class="legend-title">노드 유형</div>
  <div class="legend-row" data-count-type="company">
    <div class="lc"></div>
    <span class="legend-label">회사</span>
    <span class="legend-count" data-count-type="company">0 건</span>
  </div>
  <!-- ... -->
</div>
```

**JavaScript 업데이트** (`graph.js:580-599`):
```javascript
// 라인 ~580
const typeCounts = {
  company: NODES.filter(n => n.type === 'company').length,
  person: NODES.filter(n => n.type === 'person').length,
  major: NODES.filter(n => n.type === 'major').length,
  institution: NODES.filter(n => n.type === 'institution').length,
};
// 범례 업데이트
updateFilterCounts();
```

**CSS 스타일** (`graph.css:863-920`):
```css
.graph-legend {
  position: absolute;
  left: 16px;
  bottom: calc(34px * 3 + 4px * 2 + 24px);
  /* ... */
}
```

---

### 5. 필터링 로직

#### 위치: `frontend/graph.js`

**주요 함수**:

1. **`toggleFilter()`** (라인 2400-2430)
   - **역할**: 노드 타입별 필터링
   - **현재 상태**: 
     - ✅ 필터링 후 렌더링 (`renderGraph()` 호출)
     - ⚠️ 레이아웃 재계산 없음 (기존 `positions` 사용)
   - **문제점**: 
     - 필터링 후 노드 수가 줄어도 레이아웃이 재계산되지 않음
     - 밀집도 문제가 지속될 수 있음

```javascript
// 라인 2400-2430
function toggleFilter(el) {
  const f = el.dataset.filter;
  // 필터 토글
  // 레이아웃 재계산 없음 (기존 positions 사용)
  renderGraph(); // 렌더링만 재실행
}
```

2. **`buildGraphView()`** (라인 1033-1045)
   - **역할**: 필터링된 노드 뷰 생성
   - **사용**: `initPositions()`에서 호출
   - **문제점**: 필터링 후에도 노드 수가 많을 수 있음

---

## 🎯 CTO 관점 개선 방안

### 1. 레이아웃 알고리즘 추가 개선 (P0)

**현재 상태**: 
- ✅ `LAYOUT_CONFIG.force` 파라미터 존재 (라인 51-75)
- ✅ `minDist: 800` 설정 (라인 54)
- ✅ `repulsionStrength: 600` 설정 (라인 56)
- ✅ 노드 수에 비례한 반경 확대 (라인 1105, 1088)

**문제**: 
- ⚠️ 대용량 데이터(4000+ 노드)에서도 충분하지 않을 수 있음
- ⚠️ Force simulation 반복 횟수 제한 (`maxIter: 1200`)

**해결 방안**:
- 노드 수에 따른 동적 파라미터 조정
- Force simulation 반복 횟수 증가
- 클러스터링 알고리즘 적용

**코드 위치**: `frontend/graph.js:1047-1304` (`initPositions`)

**권장 수정**:
```javascript
// 라인 1121-1127 근처
const cfg = LAYOUT_CONFIG.force;
// 노드 수에 따른 동적 조정
const nodeCount = allNodes.length;
const dynamicMinDist = nodeCount > 2000 ? cfg.minDist * 1.5 : cfg.minDist;
const dynamicRepulsionStrength = nodeCount > 2000 ? cfg.repulsionStrength * 1.5 : cfg.repulsionStrength;
const dynamicMaxIter = nodeCount > 2000 ? cfg.maxIter * 2 : cfg.maxIter;
```

---

### 2. Vis.js Physics 옵션 검토 (P0)

**현재 상태**: 
- ⚠️ **Physics 비활성화**: `physics: { enabled: false }` (라인 1701)
- ⚠️ **고정 좌표**: `fixed: { x: true, y: true }` (라인 1578)

**문제**: 
- 🔴 Vis.js의 자동 레이아웃 기능 미사용
- 🔴 실시간 레이아웃 조정 불가능
- ⚠️ 서버/클라이언트 레이아웃 계산된 좌표만 사용

**해결 방안**:
- **옵션 A (권장)**: Physics를 조건부로 활성화 (대용량 데이터에서만)
- **옵션 B**: Physics 활성화하되 초기 좌표를 힌트로 제공
- **옵션 C**: 클러스터링 기능 활용

**코드 위치**: `frontend/graph.js:1683-1711` (`renderGraphWithVisJs`)

**권장 수정 (옵션 A)**:
```javascript
// 라인 1683-1711
const options = {
  // ...
  physics: {
    enabled: visibleNodes.length > 1000, // 대용량 데이터에서만 활성화
    stabilization: {
      enabled: true,
      iterations: 200,
      fit: true
    },
    repulsion: {
      nodeDistance: 200,
      centralGravity: 0.1,
      springLength: 150,
      springConstant: 0.05,
      damping: 0.09
    },
    solver: 'repulsion'
  },
  // ...
};
```

---

### 3. 초기 뷰 제한 기능 강화 (P0)

**현재 상태**: 
- ✅ `INITIAL_VIEW_CONFIG` 존재 (라인 43-49)
- ✅ 중요 노드만 표시 기능 (라인 1473-1517)
- ⚠️ 하지만 여전히 밀집도 문제 발생 가능

**문제**: 
- 초기 뷰 제한이 활성화되어도 레이아웃이 재계산되지 않음
- 필터링 후에도 레이아웃이 재계산되지 않음

**해결 방안**:
- 초기 뷰 제한 시 레이아웃 재계산
- 필터링 후 레이아웃 재계산 옵션 추가

**코드 위치**: `frontend/graph.js:1473-1517` (`renderGraphWithVisJs`)

**권장 수정**:
```javascript
// 라인 1473-1517
if (INITIAL_VIEW_CONFIG.enabled && visibleNodes.length > INITIAL_VIEW_CONFIG.maxNodes) {
  // 중요 노드만 필터링
  visibleNodes = filteredNodes;
  
  // 레이아웃 재계산 (필터링된 노드만)
  await initPositions(); // 레이아웃 재계산
}
```

---

### 4. 클러스터링 기능 추가 (P1)

**현재 상태**: 
- ⚠️ 클러스터링 코드 주석 처리됨 (라인 1749)
- ⚠️ 더블클릭 클러스터 확장 기능만 존재 (라인 1401-1405)

**문제**: 
- 대용량 데이터 처리 전략 부재
- 자동 클러스터링 없음

**해결 방안**:
- Vis.js 클러스터링 기능 활용
- 노드 타입별/연결 기반 클러스터링
- 줌 레벨에 따른 클러스터 해제

**코드 위치**: `frontend/graph.js:1410-1751` (`renderGraphWithVisJs`)

**권장 수정**:
```javascript
// 라인 1749 이후
// 노드 수가 임계값을 초과하면 자동 클러스터링
if (visibleNodes.length > 1000 && visNetwork) {
  visNetwork.clusterByConnection({
    clusterNodeProperties: {
      borderWidth: 3,
      shape: 'box',
      font: { size: 20 },
      color: { background: 'rgba(216, 86, 4, 0.1)' }
    }
  });
}
```

---

### 5. 필터링 개선 (P1)

**문제**: 필터링 후 레이아웃 재계산 없음

**해결 방안**:
- 필터링 후 레이아웃 재계산
- 필터링된 노드만 렌더링
- 레이아웃 캐싱

**코드 위치**: `frontend/graph.js:2400-2430` (`toggleFilter`)

**권장 수정**:
```javascript
function toggleFilter(el) {
  // 필터 토글
  // ...
  
  // 레이아웃 재계산
  await initPositions();
  renderGraph();
}
```

---

### 6. 성능 최적화 (P2)

**문제**: 대용량 데이터 렌더링 성능 이슈 가능성

**해결 방안**:
- 가상화 (Virtualization)
- 레벨 오브 디테일 (LOD)
- 웹 워커 활용

**코드 위치**: 전체 렌더링 파이프라인

---

## 📊 코드 위치 요약

| 기능 | 파일 | 함수/라인 | 우선순위 | 상태 |
|------|------|----------|---------|------|
| 레이아웃 계산 | `graph.js` | `initPositions()` (1047-1304) | P0 | ✅ 개선됨 |
| 서버 레이아웃 | `graph.js` | `fetchServerLayout()` (357-383) | P0 | ✅ 구현됨 |
| 그래프 뷰 빌드 | `graph.js` | `buildGraphView()` (1033-1045) | P0 | ✅ 구현됨 |
| 그래프 렌더링 | `graph.js` | `renderGraphWithVisJs()` (1410-1751) | P0 | ⚠️ Physics 비활성화 |
| 노드 크기 계산 | `graph.js` | `calculateNodeSize()` (175-238) | P1 | ✅ 구현됨 |
| 노드 생성 | `graph.js` | `renderGraphWithVisJs()` 내부 (1523-1604) | P1 | ✅ 구현됨 |
| 엣지 생성 | `graph.js` | `renderGraphWithVisJs()` 내부 (1626-1681) | P1 | ✅ 구현됨 |
| 초기 뷰 제한 | `graph.js` | `renderGraphWithVisJs()` 내부 (1473-1517) | P0 | ⚠️ 레이아웃 재계산 없음 |
| 필터링 | `graph.js` | `toggleFilter()` (2400-2430) | P1 | ⚠️ 레이아웃 재계산 없음 |
| 범례 업데이트 | `graph.js` | `updateFilterCounts()` (2418-2422) | P2 | ✅ 구현됨 |
| 범례 HTML | `graph.html` | `.graph-legend` (149-173) | - | ✅ 구현됨 |
| 범례 CSS | `graph.css` | `.graph-legend` (863-920) | - | ✅ 구현됨 |
| 레이아웃 설정 | `graph.js` | `LAYOUT_CONFIG` (51-75) | P0 | ✅ 개선됨 |
| 초기 뷰 설정 | `graph.js` | `INITIAL_VIEW_CONFIG` (43-49) | P0 | ✅ 구현됨 |

---

## ✅ 즉시 조치 사항

### P0 (Critical)

1. **레이아웃 알고리즘 동적 파라미터 조정**
   - 파일: `frontend/graph.js:1047-1304`
   - 함수: `initPositions()`
   - 수정: 노드 수에 따른 동적 파라미터 조정
   - 라인: 1121-1127 근처

2. **초기 뷰 제한 시 레이아웃 재계산**
   - 파일: `frontend/graph.js:1473-1517`
   - 함수: `renderGraphWithVisJs()` 내부
   - 수정: 필터링 후 레이아웃 재계산 추가

3. **필터링 후 레이아웃 재계산**
   - 파일: `frontend/graph.js:2400-2430`
   - 함수: `toggleFilter()`
   - 수정: 필터링 후 `initPositions()` 호출

### P1 (High)

1. **Vis.js Physics 조건부 활성화**
   - 파일: `frontend/graph.js:1683-1711`
   - 함수: `renderGraphWithVisJs()`
   - 수정: 대용량 데이터에서만 Physics 활성화

2. **클러스터링 기능 추가**
   - 파일: `frontend/graph.js:1749`
   - 함수: `renderGraphWithVisJs()` 내부
   - 수정: 자동 클러스터링 로직 추가

---

## 📋 핵심 발견 사항 요약

### 현재 구현 상태

#### ✅ 이미 개선된 사항
1. **레이아웃 파라미터**: `LAYOUT_CONFIG.force`에 밀집 방지 파라미터 존재
   - `minDist: 800` (라인 54)
   - `repulsionStrength: 600` (라인 56)
   - `collisionRadiusMultiplier: 8.0` (라인 57)
   - 노드 수에 비례한 반경 확대 (라인 1105, 1088)

2. **초기 뷰 제한**: `INITIAL_VIEW_CONFIG`로 중요 노드만 표시 (라인 43-49)

3. **동적 노드 크기**: `calculateNodeSize()` 함수로 연결 수/지분율 기반 크기 조정 (라인 175-238)

4. **줌 기반 라벨**: 줌 레벨에 따른 라벨 표시/숨김 (라인 1550-1571)

#### ⚠️ 여전히 문제인 사항
1. **Physics 비활성화**: Vis.js physics가 비활성화되어 실시간 레이아웃 조정 불가 (라인 1701)

2. **고정 좌표**: 계산된 좌표를 고정하여 밀집도 개선 불가 (라인 1578)

3. **레이아웃 재계산 없음**: 필터링/초기 뷰 제한 후 레이아웃이 재계산되지 않음

4. **대용량 데이터 한계**: 4000+ 노드에서 레이아웃 알고리즘 한계

---

## 🎯 권장 해결 전략

### 전략 1: 레이아웃 알고리즘 강화 (즉시 적용 가능)

**목적**: 기존 Force-directed 레이아웃 개선

**방법**:
- 노드 수에 따른 동적 파라미터 조정
- Force simulation 반복 횟수 증가
- 노드 간 최소 거리 강화

**코드 위치**: `frontend/graph.js:1121-1127`

---

### 전략 2: 클러스터링 활성화 (단기)

**목적**: 대용량 데이터를 그룹화하여 표시

**방법**:
- Vis.js 클러스터링 기능 활용
- 노드 타입별/연결 기반 클러스터링
- 줌 레벨에 따른 클러스터 해제

**코드 위치**: `frontend/graph.js:1749`

---

### 전략 3: Physics 조건부 활성화 (중기)

**목적**: 대용량 데이터에서만 Vis.js physics 활용

**방법**:
- 노드 수 임계값 기반 Physics 활성화
- 초기 좌표를 힌트로 제공
- Physics와 고정 좌표 하이브리드

**코드 위치**: `frontend/graph.js:1701`

---

### 전략 4: 필터링 개선 (단기)

**목적**: 필터링 후 레이아웃 재계산

**방법**:
- 필터링 후 `initPositions()` 호출
- 필터링된 노드만 레이아웃 계산
- 레이아웃 캐싱 최적화

**코드 위치**: `frontend/graph.js:2400-2430`

---

## 🔗 관련 문서

- [마이그레이션 문서](./CTO-MIGRATION-VISJS-HTML.md)
- [캔버스 CSS 검토](./CTO-CANVAS-CSS-REVIEW.md)
- [로고 검토](./CTO-LOGO-REVIEW.md)
- [콘솔 에러 검토](./CTO-CONSOLE-ERROR-REVIEW.md)
