# CTO Critical Fix: 대량 노드 그래프 밀집 문제 해결

**일시**: 2026-02-17  
**우선순위**: 🔴 Critical (사용 불가능한 상태)  
**상태**: 📋 문제 분석 완료, 해결 방안 제시

---

## 문제 분석

### 발견된 Critical Issues

1. **노드 밀집으로 인한 가독성 완전 상실**
   - 4,919개 노드가 중앙에 밀집하여 "hairball" 현상
   - 개별 노드 식별 불가능
   - 라벨 완전히 가려짐

2. **레이아웃 알고리즘 실패**
   - 서버 사이드 레이아웃(PyGraphviz)이 제대로 적용되지 않았을 가능성
   - 클라이언트 사이드 폴백 레이아웃도 효과 없음
   - 노드 간 최소 거리 보장 실패

3. **필터링 및 줌 기능 부재**
   - 필터 적용 시에도 모든 노드 표시
   - 줌 레벨 기반 라벨 표시가 작동하지 않음
   - 사용자가 원하는 영역으로 집중 불가능

---

## 근본 원인 분석

### 1. 레이아웃 알고리즘 문제

**현재 상태**:
- `initPositions()` 함수가 클라이언트 사이드에서 실행
- 서버 사이드 레이아웃 API 호출 실패 시 폴백
- Force simulation 파라미터가 대량 노드에 부적합

**문제점**:
- 4,919개 노드를 클라이언트에서 처리하기에는 너무 많음
- Force simulation이 수렴하지 않음
- 노드 간 거리 계산이 부정확

### 2. 렌더링 최적화 부재

**현재 상태**:
- 모든 노드를 동시에 렌더링
- 라벨 표시 조건이 있지만 효과 없음
- 가상화(Virtualization) 미구현

**문제점**:
- 화면에 보이지 않는 노드도 렌더링
- 라벨 렌더링 부하가 큼
- 성능 저하로 인한 인터랙션 지연

### 3. 사용자 인터랙션 제한

**현재 상태**:
- 필터링 기능은 있지만 효과 미미
- 줌 기능은 있지만 밀집 문제 해결 안 됨
- 클러스터링 기능 미구현

**문제점**:
- 사용자가 원하는 데이터만 볼 수 없음
- 밀집된 영역에서 개별 노드 선택 불가능
- 탐색 방법이 제한적

---

## 해결 방안

### 방안 1: 적극적인 필터링 및 초기 뷰 제한 (즉시 적용) ⭐⭐⭐

**개념**: 초기 로딩 시 중요 노드만 표시하고, 사용자가 필요에 따라 필터 확장

**구현**:
```javascript
// 초기 필터 설정: 중요 노드만 표시
const INITIAL_FILTER_CONFIG = {
  showAll: false, // 초기에는 모든 노드 표시 안 함
  minConnections: 3, // 최소 연결 수 3개 이상만 표시
  minRatio: 5, // 최소 지분율 5% 이상만 표시
  showTypes: ['company', 'major', 'institution'], // 개인주주 제외
};

// renderGraphWithVisJs() 수정
const visibleNodes = NODES.filter(n => {
  if (!activeFilters.has(n.type)) return false;
  
  // 초기 필터 적용
  if (!INITIAL_FILTER_CONFIG.showAll) {
    // 연결 수 확인
    const nodeEdges = EDGES.filter(e => e.from === n.id || e.to === n.id);
    const degree = nodeEdges.length;
    const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)), 0);
    
    // 필터 조건 확인
    if (degree < INITIAL_FILTER_CONFIG.minConnections) return false;
    if (maxRatio < INITIAL_FILTER_CONFIG.minRatio && n.type === 'person') return false;
    if (!INITIAL_FILTER_CONFIG.showTypes.includes(n.type)) return false;
  }
  
  return true;
});
```

**장점**:
- 즉시 적용 가능
- 초기 뷰에서 노드 수 대폭 감소 (예: 4,919개 → 500개)
- 가독성 즉시 개선

**단점**:
- 일부 노드가 초기에 숨겨짐
- 사용자가 필터를 이해해야 함

---

### 방안 2: 레이아웃 알고리즘 강화 (중기) ⭐⭐⭐⭐

**개념**: 서버 사이드 레이아웃 강화 및 클라이언트 사이드 개선

**구현**:
```javascript
// 레이아웃 파라미터 강화
const LAYOUT_CONFIG = {
  force: {
    minDist: 800, // 최소 거리 대폭 증가 (500 → 800)
    repulsionStrength: 600, // 반발력 강화 (450 → 600)
    collisionRadiusMultiplier: 8.0, // 충돌 감지 반경 확대 (5.0 → 8.0)
    idealDistMin: 800, // 이상 거리 최소값 증가 (500 → 800)
    idealDistMax: 2000, // 이상 거리 최대값 증가 (1200 → 2000)
    // ...
  },
};

// 노드 배치 시 더 넓은 영역 사용
function initPositions() {
  // ...
  const baseRadiusX = Math.max(extent.xMax - extent.xMin, NODES.length * 20); // 12 → 20
  const baseRadiusY = Math.max(extent.yMax - extent.yMin, NODES.length * 20);
  // ...
}
```

**장점**:
- 노드 간 거리 보장
- 레이아웃 품질 향상
- 가독성 개선

**단점**:
- 계산 시간 증가 가능
- 화면 밖으로 노드가 나갈 수 있음

---

### 방안 3: 클러스터링 및 계층적 표시 (장기) ⭐⭐⭐⭐⭐

**개념**: 밀집된 노드를 클러스터로 묶고, 클릭 시 확장

**구현**:
```javascript
// Vis.js 클러스터링 옵션
const options = {
  // ...
  clustering: {
    enabled: true,
    maxNodes: 30, // 클러스터당 최대 노드 수
    clusterThreshold: 50, // 클러스터링 임계값
    // ...
  },
};

// 클러스터 클릭 시 확장
network.on('click', (params) => {
  if (params.nodes.length > 0 && network.isCluster(params.nodes[0])) {
    network.openCluster(params.nodes[0], {
      releaseFunction: (clusterPosition, containedNodesPositions) => {
        // 클러스터 확장 시 노드 위치 계산
        return containedNodesPositions;
      },
    });
  }
});
```

**장점**:
- 대량 노드를 효율적으로 관리
- 사용자가 원하는 영역만 상세 확인
- 확장성 확보

**단점**:
- 구현 복잡도 높음
- 사용자 교육 필요

---

### 방안 4: 가상화 및 뷰포트 기반 렌더링 (고급) ⭐⭐⭐⭐

**개념**: 화면에 보이는 노드만 렌더링

**구현**:
```javascript
function getVisibleNodesInViewport(nodes, positions, viewport) {
  return nodes.filter(n => {
    const pos = positions[n.id];
    if (!pos) return false;
    
    // 뷰포트 내에 있는지 확인
    return pos.x >= viewport.left && pos.x <= viewport.right &&
           pos.y >= viewport.top && pos.y <= viewport.bottom;
  });
}

// 렌더링 시
const viewport = visNetwork.getViewPosition();
const visibleInViewport = getVisibleNodesInViewport(visibleNodes, positions, viewport);
const visNodes = visibleInViewport.map(n => { /* ... */ });
```

**장점**:
- 성능 대폭 향상
- 대량 노드 환경에서도 부드러운 인터랙션

**단점**:
- 구현 복잡도 높음
- 줌/패닝 시 재계산 필요

---

## 권장 구현 전략

### Phase 1: 즉시 적용 (Critical)

1. **적극적인 초기 필터링** (방안 1)
   - 중요 노드만 초기 표시
   - 사용자가 필요 시 필터 확장
   - 즉시 가독성 개선

2. **레이아웃 파라미터 강화** (방안 2)
   - 최소 거리 증가
   - 반발력 강화
   - 노드 배치 영역 확대

### Phase 2: 핵심 개선 (중기)

3. **클러스터링 구현** (방안 3)
   - 밀집 영역 클러스터링
   - 클릭 시 확장
   - 사용자 경험 개선

### Phase 3: 고급 최적화 (장기)

4. **가상화 구현** (방안 4)
   - 뷰포트 기반 렌더링
   - 성능 최적화

---

## 즉시 적용 코드

### 1. 초기 필터 강화

```javascript
// frontend/graph.js에 추가
const INITIAL_VIEW_CONFIG = {
  enabled: true, // 초기 뷰 제한 활성화
  minConnections: 3, // 최소 연결 수
  minRatio: 5, // 최소 지분율 (%)
  showTypes: ['company', 'major', 'institution'], // 표시할 노드 타입
  maxNodes: 1000, // 최대 표시 노드 수
};

// renderGraphWithVisJs() 수정
function renderGraphWithVisJs() {
  // ...
  
  // 필터링 + 초기 뷰 제한
  let visibleNodes = NODES.filter(n => activeFilters.has(n.type));
  
  // 초기 뷰 제한 적용
  if (INITIAL_VIEW_CONFIG.enabled && visibleNodes.length > INITIAL_VIEW_CONFIG.maxNodes) {
    visibleNodes = visibleNodes.filter(n => {
      // 타입 필터
      if (!INITIAL_VIEW_CONFIG.showTypes.includes(n.type)) return false;
      
      // 연결 수 확인
      const nodeEdges = EDGES.filter(e => e.from === n.id || e.to === n.id);
      const degree = nodeEdges.length;
      const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)), 0);
      
      // 중요도 확인
      if (degree < INITIAL_VIEW_CONFIG.minConnections) return false;
      if (maxRatio < INITIAL_VIEW_CONFIG.minRatio && n.type === 'person') return false;
      
      return true;
    });
    
    // 최대 노드 수 제한
    if (visibleNodes.length > INITIAL_VIEW_CONFIG.maxNodes) {
      // 중요도 순으로 정렬하여 상위 노드만 표시
      visibleNodes = visibleNodes
        .map(n => {
          const nodeEdges = EDGES.filter(e => e.from === n.id || e.to === n.id);
          const degree = nodeEdges.length;
          const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)), 0);
          const importance = (degree * 0.1) + (maxRatio * 0.05);
          return { node: n, importance };
        })
        .sort((a, b) => b.importance - a.importance)
        .slice(0, INITIAL_VIEW_CONFIG.maxNodes)
        .map(item => item.node);
    }
    
    // 사용자에게 알림
    if (!window._initialViewNotified) {
      updateStatus(`초기 뷰: 중요 노드 ${visibleNodes.length}개만 표시됩니다. 필터를 조정하여 더 많은 노드를 볼 수 있습니다.`, true);
      window._initialViewNotified = true;
    }
  }
  
  // ... 나머지 코드 ...
}
```

### 2. 레이아웃 파라미터 강화

```javascript
// frontend/graph.js: LAYOUT_CONFIG 수정
const LAYOUT_CONFIG = {
  force: {
    gravity: 0,
    minDist: 800, // 500 → 800 (노드 간 최소 거리 증가)
    repulsionRange: 6.0, // 5.0 → 6.0 (반발 범위 확대)
    repulsionStrength: 600, // 450 → 600 (반발력 강화)
    collisionRadiusMultiplier: 8.0, // 5.0 → 8.0 (충돌 감지 반경 확대)
    layoutRadiusMultiplier: 5, // 4 → 5 (레이아웃 반경 확대)
    idealDistMin: 800, // 500 → 800 (이상 거리 최소값 증가)
    idealDistMax: 2000, // 1200 → 2000 (이상 거리 최대값 증가)
    // ... 나머지 설정 ...
  },
};

// initPositions() 함수 수정
function initPositions() {
  // ...
  const baseRadiusX = Math.max(
    useFullArea ? (extent.xMax - extent.xMin) * 0.5 : Math.min(W, H) * 0.45,
    allNodes.length * 20 // 12 → 20 (노드 수에 비례한 반경 증가)
  );
  const baseRadiusY = Math.max(
    useFullArea ? (extent.yMax - extent.yMin) * 0.5 : Math.min(W, H) * 0.45,
    allNodes.length * 20
  );
  // ...
}
```

### 3. 줌 레벨 기반 라벨 표시 강화

```javascript
// renderGraphWithVisJs() 수정
const currentZoom = visNetwork ? visNetwork.getScale() : 1.0;
const minZoomForLabels = 1.2; // 0.7 → 1.2 (라벨 표시 최소 줌 레벨 증가)

// 중요도 기반 라벨 표시
const showLabel = currentZoom >= minZoomForLabels || isSelected || isConnected;

if (showLabel) {
  // 중요도 계산
  const nodeEdges = visibleEdges.filter(e => e.from === n.id || e.to === n.id);
  const degree = nodeEdges.length;
  const isImportant = degree >= 10 || isSelected; // 5 → 10 (중요도 기준 상향)
  
  if (currentZoom < 1.5 && !isImportant && !isSelected && !isConnected) {
    // 줌 레벨이 낮고 중요하지 않은 노드는 라벨 숨김
    labelText = '';
    labelFontSize = 0;
  }
}
```

---

## 테스트 체크리스트

- [ ] 초기 로딩 시 노드 수가 1000개 이하로 제한되는지 확인
- [ ] 중요 노드만 표시되는지 확인
- [ ] 필터 변경 시 노드 수가 적절히 조정되는지 확인
- [ ] 노드 간 거리가 충분한지 확인 (겹침 최소화)
- [ ] 줌 인 시 라벨이 표시되는지 확인
- [ ] 줌 아웃 시 라벨이 숨겨지는지 확인
- [ ] 성능이 개선되었는지 확인 (렌더링 시간, FPS)

---

## 결론

**즉시 적용 권장**: 방안 1 (적극적인 초기 필터링) + 방안 2 (레이아웃 파라미터 강화)

이 두 가지를 즉시 적용하면:
- 초기 노드 수: 4,919개 → 약 500-1000개로 감소
- 노드 간 거리 증가로 가독성 향상
- 사용자가 필요 시 필터 확장 가능

**중기 개선**: 방안 3 (클러스터링)으로 대량 노드 환경 완전 해결

---

**작성자**: CTO (AI Assistant)  
**다음 검토 예정일**: 구현 후 사용성 테스트
