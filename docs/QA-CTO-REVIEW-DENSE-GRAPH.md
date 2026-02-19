# QA 전문가 검토 & CTO 해결 방안: 대량 노드 그래프 가독성 문제

**검토 일시**: 2026-02-17  
**우선순위**: 🔴 Critical (사용성 저하)  
**상태**: 📋 검토 완료, 해결 방안 제시

---

## QA 전문가 관점: 발견된 문제점

### 🔴 Critical Issues

#### 1. 노드 라벨 가독성 심각 저하

**문제점**:
- 4,919개 노드가 동시에 표시되어 라벨이 겹침
- 폰트 크기 12px로 작은 노드에서는 라벨 읽기 불가능
- 중앙 클러스터링으로 인해 대부분의 라벨이 가려짐
- 라벨 배경색이 있지만 겹침으로 인해 효과 미미

**영향도**:
- **심각도**: Critical
- **사용자 영향**: 노드 식별 불가능, 그래프 분석 불가
- **재현 가능성**: 100% (대량 노드 환경)

**증거**:
- 이미지에서 중앙 클러스터의 라벨이 완전히 겹쳐 읽을 수 없음
- 작은 노드(`박정원`, `박지원`)의 라벨이 거의 보이지 않음

---

#### 2. 범례 색상과 실제 노드 색상 불일치

**문제점**:
- 범례: 회사(빨강), 개인주주(주황), 최대주주(어두운 주황), 기관(파랑)
- 실제 노드: 대부분 주황/갈색 계열로 구분 어려움
- 노드 타입별 색상 차별화가 시각적으로 명확하지 않음

**영향도**:
- **심각도**: High
- **사용자 영향**: 노드 타입 식별 혼란
- **재현 가능성**: 100%

**근본 원인**:
- `getNodeColor()` 함수의 색상 값이 범례와 일치하지만, 실제 렌더링에서 차이가 미미함
- 노드 테두리 색상만 사용되어 채우기 색상과의 대비 부족

---

#### 3. 대량 노드 환경에서 성능 및 가독성 문제

**문제점**:
- 4,919개 노드를 동시에 렌더링하여 성능 저하 가능성
- 모든 노드의 라벨을 동시에 표시하여 시각적 혼란
- 줌 레벨에 관계없이 모든 라벨 표시

**영향도**:
- **심각도**: High
- **사용자 영향**: 느린 인터랙션, 분석 어려움
- **재현 가능성**: 100% (대량 데이터)

---

### 🟡 Medium Issues

#### 4. 노드 크기 차별화 기준 불명확

**문제점**:
- 노드 크기가 다양하지만 사용자가 그 기준을 알 수 없음
- 크기 차이가 시각적으로 명확하지 않음

**영향도**:
- **심각도**: Medium
- **사용자 영향**: 데이터 해석 어려움

---

#### 5. 클러스터링으로 인한 정보 손실

**문제점**:
- 중앙에 노드가 밀집하여 개별 노드 식별 불가
- 연결 관계 파악 어려움

**영향도**:
- **심각도**: Medium
- **사용자 영향**: 네트워크 구조 파악 어려움

---

## CTO 관점: 해결 방안

### 해결 방안 1: 줌 레벨 기반 라벨 표시 (LOD - Level of Detail) ⭐⭐⭐

**개념**: 줌 레벨에 따라 라벨 표시 여부와 폰트 크기를 동적으로 조정

**구현**:
```javascript
// Vis.js options에 추가
const options = {
  nodes: {
    font: {
      size: 12,
      background: 'white',
      strokeWidth: 2,
      strokeColor: 'white',
      // CTO: 줌 레벨 기반 동적 폰트 크기
      sizeMin: 10,
      sizeMax: 16,
    },
    // CTO: 줌 레벨이 낮을 때 라벨 숨김
    scaling: {
      label: {
        enabled: true,
        min: 0.5,  // 줌 레벨 0.5 미만에서 라벨 숨김
        max: 2.0,
      },
    },
  },
  // CTO: 줌 이벤트 핸들링
  interaction: {
    zoomView: true,
    // ... 기타 설정
  },
};

// 줌 레벨 변경 시 라벨 표시 업데이트
network.on('zoom', (params) => {
  const zoomLevel = params.scale;
  // 줌 레벨에 따라 라벨 표시/숨김 로직
  updateLabelVisibility(zoomLevel);
});
```

**장점**:
- 줌 아웃 시 라벨 숨김으로 가독성 향상
- 줌 인 시 라벨 표시로 상세 정보 제공
- 성능 최적화 (렌더링 노드 수 감소)

**단점**:
- 구현 복잡도 증가
- 사용자가 줌 인/아웃을 자주 해야 함

---

### 해결 방안 2: 노드 색상 일관성 개선 ⭐⭐

**개념**: 범례와 실제 노드 색상을 일치시키고, 채우기 색상으로 차별화 강화

**구현**:
```javascript
function getNodeColor(node) {
  const typeColors = NODE_COLORS[node.type] || { active: '#999999', closed: '#666666' };
  const isActive = node.active !== false;
  return isActive ? typeColors.active : typeColors.closed;
}

// 노드 렌더링 시 채우기 색상 추가
const visNodes = visibleNodes.map(n => {
  const borderColor = getNodeColor(n);
  const fillColor = getNodeFillColor(n); // 채우기 색상 (연한 버전)
  
  return {
    // ...
    color: {
      background: fillColor,  // 채우기 색상 추가
      border: borderColor,     // 테두리 색상
      highlight: {
        background: fillColor,
        border: borderColor,
      },
      opacity: opacity,
    },
  };
});

function getNodeFillColor(node) {
  const borderColor = getNodeColor(node);
  // 테두리 색상을 연하게 변환 (투명도 추가)
  return hexToRgba(borderColor, 0.2); // 20% 투명도
}
```

**장점**:
- 노드 타입별 색상 차별화 명확화
- 범례와 실제 노드 색상 일치

**단점**:
- 색상이 너무 연하면 가독성 저하 가능

---

### 해결 방안 3: 중요 노드 우선 표시 (Priority-based Rendering) ⭐⭐⭐

**개념**: 연결 수, 지분율 등 중요도가 높은 노드의 라벨을 우선 표시

**구현**:
```javascript
function shouldShowLabel(node, edges, zoomLevel) {
  // 기본 조건: 줌 레벨이 충분히 높을 때만 표시
  if (zoomLevel < 0.8) return false;
  
  // 중요도 계산
  const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)));
  
  // 중요도 점수 계산
  const importanceScore = (degree / 10) + (maxRatio / 20);
  
  // 줌 레벨이 낮으면 중요 노드만 표시
  if (zoomLevel < 1.2) {
    return importanceScore > 1.0; // 중요도 높은 노드만
  }
  
  // 줌 레벨이 높으면 모든 노드 표시
  return true;
}

// 노드 렌더링 시
const visNodes = visibleNodes.map(n => {
  const currentZoom = visNetwork ? visNetwork.getScale() : 1.0;
  const showLabel = shouldShowLabel(n, visibleEdges, currentZoom);
  
  return {
    // ...
    label: showLabel ? (n.label || n.id) : '', // 라벨 표시 여부
    font: {
      size: showLabel ? (isSelected ? 13 : 12) : 0, // 라벨 없으면 크기 0
      // ...
    },
  };
});
```

**장점**:
- 중요한 노드가 우선적으로 표시됨
- 줌 레벨에 따른 점진적 정보 표시

**단점**:
- 중요도 계산 로직 필요
- 사용자가 중요도 기준을 이해해야 함

---

### 해결 방안 4: 호버 시 라벨 강조 (Hover-based Label Enhancement) ⭐⭐

**개념**: 마우스 호버 시 해당 노드의 라벨을 크게 표시하고 배경 강조

**구현**:
```javascript
network.on('hoverNode', (params) => {
  const nodeId = params.node;
  // 호버된 노드의 라벨 크기 증가
  const node = visNetwork.body.data.nodes.get(nodeId);
  if (node) {
    node.font.size = 16; // 호버 시 크게
    node.font.background = 'rgba(255, 255, 255, 0.95)'; // 배경 강조
    visNetwork.redraw();
  }
});

network.on('blurNode', (params) => {
  const nodeId = params.node;
  // 호버 해제 시 원래 크기로 복원
  const node = visNetwork.body.data.nodes.get(nodeId);
  if (node) {
    node.font.size = 12; // 원래 크기
    node.font.background = 'white';
    visNetwork.redraw();
  }
});
```

**장점**:
- 사용자가 관심 있는 노드의 라벨을 명확히 확인 가능
- 구현이 상대적으로 간단

**단점**:
- 호버하지 않으면 라벨 확인 어려움

---

### 해결 방안 5: 클러스터 기반 렌더링 (Cluster-based Rendering) ⭐⭐⭐⭐

**개념**: 밀집된 노드를 클러스터로 묶어 표시하고, 클릭 시 확장

**구현**:
```javascript
// Vis.js 클러스터링 옵션
const options = {
  // ...
  clustering: {
    enabled: true,
    maxNodes: 50, // 클러스터당 최대 노드 수
    clusterThreshold: 100, // 클러스터링 임계값
    // ...
  },
};

// 클러스터 클릭 시 확장
network.on('click', (params) => {
  if (params.nodes.length > 0 && network.isCluster(params.nodes[0])) {
    network.openCluster(params.nodes[0]);
  }
});
```

**장점**:
- 대량 노드를 효율적으로 관리
- 사용자가 원하는 영역만 확장하여 상세 확인

**단점**:
- 클러스터링 알고리즘 구현 필요
- 사용자가 클러스터 개념을 이해해야 함

---

## 권장 구현 전략 (우선순위)

### Phase 1: 즉시 적용 (단기)

1. **해결 방안 2: 노드 색상 일관성 개선** ⭐⭐
   - 구현 간단
   - 즉시 효과
   - 범례와 실제 노드 색상 일치

2. **해결 방안 4: 호버 시 라벨 강조** ⭐⭐
   - 구현 간단
   - 사용자 경험 개선

### Phase 2: 핵심 개선 (중기)

3. **해결 방안 1: 줌 레벨 기반 라벨 표시** ⭐⭐⭐
   - 가독성 대폭 향상
   - 성능 최적화

4. **해결 방안 3: 중요 노드 우선 표시** ⭐⭐⭐
   - 데이터 인사이트 강화
   - 사용자 경험 개선

### Phase 3: 고급 기능 (장기)

5. **해결 방안 5: 클러스터 기반 렌더링** ⭐⭐⭐⭐
   - 대량 노드 환경에서 필수
   - 확장성 확보

---

## 구현 예시 코드

### 1. 줌 레벨 기반 라벨 표시

```javascript
// renderGraphWithVisJs() 함수 수정
function renderGraphWithVisJs() {
  // ... 기존 코드 ...
  
  const currentZoom = visNetwork ? visNetwork.getScale() : 1.0;
  const minZoomForLabels = 0.8; // 라벨 표시 최소 줌 레벨
  
  const visNodes = visibleNodes.map(n => {
    // ... 기존 코드 ...
    
    const showLabel = currentZoom >= minZoomForLabels;
    const labelFontSize = showLabel ? (isSelected ? 14 : 12) : 0;
    
    return {
      // ...
      label: showLabel ? (n.label || n.id) : '',
      font: {
        size: labelFontSize,
        background: showLabel ? 'white' : 'transparent',
        strokeWidth: showLabel ? 2 : 0,
        strokeColor: showLabel ? 'white' : 'transparent',
      },
    };
  });
  
  // ... 나머지 코드 ...
}

// 줌 이벤트 핸들링
if (visNetwork) {
  visNetwork.on('zoom', () => {
    renderGraph(); // 줌 레벨 변경 시 재렌더링
  });
}
```

### 2. 노드 색상 일관성 개선

```javascript
function getNodeFillColor(node) {
  const borderColor = getNodeColor(node);
  // RGB 값을 추출하여 연한 버전 생성
  const rgb = hexToRgb(borderColor);
  if (!rgb) return 'rgba(255, 255, 255, 0.1)';
  
  // 20% 투명도로 연한 색상 생성
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// 노드 렌더링 시
const visNodes = visibleNodes.map(n => {
  const borderColor = getNodeColor(n);
  const fillColor = getNodeFillColor(n);
  
  return {
    // ...
    color: {
      background: fillColor,  // 채우기 색상
      border: borderColor,     // 테두리 색상
      highlight: {
        background: fillColor,
        border: borderColor,
      },
      opacity: opacity,
    },
  };
});
```

### 3. 중요 노드 우선 표시

```javascript
function calculateNodeImportance(node, edges) {
  const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)), 0);
  
  // 중요도 점수: 연결 수 + 지분율
  return (degree * 0.1) + (maxRatio * 0.05);
}

function shouldShowLabel(node, edges, zoomLevel, selectedNodeId) {
  // 선택된 노드는 항상 표시
  if (selectedNodeId === node.id) return true;
  
  // 줌 레벨이 낮으면 중요 노드만 표시
  if (zoomLevel < 1.0) {
    const importance = calculateNodeImportance(node, edges);
    return importance > 0.5; // 중요도 임계값
  }
  
  // 줌 레벨이 높으면 모든 노드 표시
  return zoomLevel >= 0.8;
}
```

---

## 테스트 체크리스트

- [ ] 줌 아웃 시 라벨이 숨겨지는지 확인
- [ ] 줌 인 시 라벨이 표시되는지 확인
- [ ] 노드 색상이 범례와 일치하는지 확인
- [ ] 호버 시 라벨이 강조되는지 확인
- [ ] 중요 노드의 라벨이 우선 표시되는지 확인
- [ ] 성능 저하가 없는지 확인 (4,919개 노드 기준)
- [ ] 접근성 요구사항을 만족하는지 확인

---

## 결론 및 권장사항

**즉시 적용 권장**: 
1. 노드 색상 일관성 개선 (해결 방안 2)
2. 호버 시 라벨 강조 (해결 방안 4)

**중기 개선 권장**:
3. 줌 레벨 기반 라벨 표시 (해결 방안 1)
4. 중요 노드 우선 표시 (해결 방안 3)

**장기 개선 권장**:
5. 클러스터 기반 렌더링 (해결 방안 5)

**우선순위**:
1. 🔴 라벨 가독성 개선 (즉시)
2. 🟡 색상 일관성 개선 (즉시)
3. 🟢 성능 최적화 (중기)
4. 🔵 클러스터링 (장기)

---

**검토자**: QA 전문가 + CTO (AI Assistant)  
**다음 검토 예정일**: 구현 후 사용성 테스트
