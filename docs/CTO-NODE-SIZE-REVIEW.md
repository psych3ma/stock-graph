# CTO 관점: 노드 크기 검토 및 개선 방안

**검토 일시**: 2026-02-17  
**우선순위**: 🟡 High (가독성 및 UX 개선)  
**상태**: 📋 검토 완료, 개선 방안 제시

---

## 현재 노드 크기 설정 분석

### 1. 기본 노드 반지름 (NODE_RADIUS)

```javascript
const NODE_RADIUS = { 
  company: 22,      // 회사: 44px (지름)
  person: 16,       // 개인주주: 32px (지름)
  major: 20,         // 최대주주: 40px (지름)
  institution: 18   // 기관: 36px (지름)
};
```

**현재 구현**:
- 타입별 고정 크기 사용
- 데이터의 중요도(지분율, 연결 수 등)를 반영하지 않음
- 모든 노드가 동일한 타입 내에서는 같은 크기

### 2. Vis.js 렌더링 크기 계산

```javascript
const baseNodeSize = (NODE_RADIUS[n.type] || 18) * 2; // 반지름 → 지름 변환

// 상태별 크기 조정
if (isSelected) {
  nodeSize = baseNodeSize * 1.2;  // 선택 시: +20%
} else if (!isConnected && selectedNodeId) {
  nodeSize = baseNodeSize * 0.7;  // 비연결 노드: -30%
}
```

**현재 동작**:
- 기본 크기: 타입별 고정값
- 선택된 노드: 20% 확대
- 비연결 노드: 30% 축소 (선택 상태일 때만)

---

## 문제점 분석

### 🔴 Critical Issues

1. **데이터 중요도 미반영**
   - 지분율이 높은 주주와 낮은 주주가 같은 크기
   - 연결 수(degree)가 많은 노드와 적은 노드가 같은 크기
   - 비즈니스 인사이트 제공에 한계

2. **대량 노드 환경에서 가독성 저하**
   - 4,919개 노드 중 개인주주 3,556개가 모두 32px로 동일
   - 작은 노드들이 클러스터링으로 인해 가려짐
   - 중요한 노드 식별 어려움

3. **시각적 계층 구조 부재**
   - 모든 노드가 동일한 중요도로 표시
   - 사용자가 중요한 노드를 빠르게 식별 불가

### 🟡 Medium Issues

4. **크기 차별화 부족**
   - 타입별 크기 차이가 미미 (16px ~ 22px)
   - 상태별 크기 조정 범위가 제한적 (0.7x ~ 1.2x)

5. **레이아웃과의 불일치**
   - 레이아웃 알고리즘은 지분율을 고려하지만, 노드 크기는 고려하지 않음
   - 큰 노드와 작은 노드가 같은 공간을 차지

---

## 개선 방안

### 방안 1: 데이터 기반 동적 크기 (권장) ⭐

**개념**: 노드의 중요도를 데이터로부터 계산하여 크기에 반영

**구현**:
```javascript
function calculateNodeSize(node, edges, selectedNodeId, connectedNodeIds) {
  const baseRadius = NODE_RADIUS[node.type] || 18;
  const baseSize = baseRadius * 2;
  
  // 1. 연결 수(degree) 기반 크기 보정
  const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  const maxDegree = Math.max(...NODES.map(n => 
    edges.filter(e => e.from === n.id || e.to === n.id).length
  ));
  const degreeFactor = 0.8 + (degree / maxDegree) * 0.4; // 0.8 ~ 1.2
  
  // 2. 지분율 기반 크기 보정 (가능한 경우)
  const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)));
  const ratioFactor = maxRatio > 0 ? 0.9 + (maxRatio / 100) * 0.3 : 1.0; // 0.9 ~ 1.2
  
  // 3. 타입별 가중치
  const typeWeight = {
    company: 1.0,
    major: 1.1,      // 최대주주는 약간 크게
    institution: 1.05, // 기관도 약간 크게
    person: 0.95    // 개인주주는 약간 작게
  };
  
  // 4. 상태별 조정
  const isSelected = selectedNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);
  let stateFactor = 1.0;
  if (isSelected) {
    stateFactor = 1.2;
  } else if (!isConnected && selectedNodeId) {
    stateFactor = 0.7;
  }
  
  // 최종 크기 계산
  const finalSize = baseSize * degreeFactor * ratioFactor * typeWeight[node.type] * stateFactor;
  
  // 최소/최대 크기 제한 (가독성 보장)
  return Math.max(16, Math.min(80, finalSize));
}
```

**장점**:
- 데이터 기반으로 중요한 노드가 자동으로 강조됨
- 사용자가 중요한 관계를 빠르게 식별 가능
- 비즈니스 인사이트 제공

**단점**:
- 계산 복잡도 증가
- 크기 변화가 너무 크면 혼란 가능

---

### 방안 2: 단순화된 크기 계층 구조

**개념**: 타입과 연결 수만 고려한 단순한 크기 차별화

**구현**:
```javascript
function calculateNodeSize(node, edges, selectedNodeId, connectedNodeIds) {
  const baseRadius = NODE_RADIUS[node.type] || 18;
  const baseSize = baseRadius * 2;
  
  // 연결 수 기반 단순 분류
  const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  
  let sizeMultiplier = 1.0;
  if (degree >= 10) {
    sizeMultiplier = 1.3;      // 고연결 노드: +30%
  } else if (degree >= 5) {
    sizeMultiplier = 1.15;     // 중연결 노드: +15%
  } else if (degree >= 2) {
    sizeMultiplier = 1.0;      // 일반 노드: 기본 크기
  } else {
    sizeMultiplier = 0.85;     // 저연결 노드: -15%
  }
  
  // 상태별 조정
  const isSelected = selectedNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);
  if (isSelected) {
    sizeMultiplier *= 1.2;
  } else if (!isConnected && selectedNodeId) {
    sizeMultiplier *= 0.7;
  }
  
  return baseSize * sizeMultiplier;
}
```

**장점**:
- 구현이 간단하고 성능 영향 적음
- 연결 수가 많은 허브 노드가 자동으로 강조됨

**단점**:
- 지분율 등 다른 중요도 지표 미반영

---

### 방안 3: 하이브리드 접근 (최적 권장) ⭐⭐⭐

**개념**: 타입별 기본 크기 + 연결 수 기반 보정 + 선택적 지분율 반영

**구현**:
```javascript
function calculateNodeSize(node, edges, selectedNodeId, connectedNodeIds) {
  const baseRadius = NODE_RADIUS[node.type] || 18;
  const baseSize = baseRadius * 2;
  
  // 1. 연결 수 기반 크기 (필수)
  const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  const allDegrees = NODES.map(n => 
    edges.filter(e => e.from === n.id || e.to === n.id).length
  );
  const maxDegree = Math.max(...allDegrees, 1);
  const avgDegree = allDegrees.reduce((a, b) => a + b, 0) / allDegrees.length;
  
  let degreeFactor = 1.0;
  if (degree > avgDegree * 1.5) {
    degreeFactor = 1.25;  // 평균보다 1.5배 이상: +25%
  } else if (degree > avgDegree) {
    degreeFactor = 1.1;   // 평균보다 큼: +10%
  } else if (degree < avgDegree * 0.5) {
    degreeFactor = 0.9;  // 평균보다 절반 이하: -10%
  }
  
  // 2. 지분율 기반 크기 (선택적, 데이터 있는 경우만)
  let ratioFactor = 1.0;
  if (nodeEdges.length > 0) {
    const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)));
    if (maxRatio > 20) {
      ratioFactor = 1.15;  // 20% 이상 지분: +15%
    } else if (maxRatio > 10) {
      ratioFactor = 1.08; // 10% 이상 지분: +8%
    }
  }
  
  // 3. 상태별 조정
  const isSelected = selectedNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);
  let stateFactor = 1.0;
  if (isSelected) {
    stateFactor = 1.2;
  } else if (!isConnected && selectedNodeId) {
    stateFactor = 0.7;
  }
  
  // 최종 크기 계산
  const finalSize = baseSize * degreeFactor * ratioFactor * stateFactor;
  
  // 최소/최대 크기 제한 (가독성 및 성능 보장)
  const minSize = baseSize * 0.6;  // 최소 60% (비연결 노드 제외)
  const maxSize = baseSize * 1.8;  // 최대 180% (선택 + 고연결)
  return Math.max(minSize, Math.min(maxSize, finalSize));
}
```

**장점**:
- 데이터 기반 자동 강조
- 성능과 가독성 균형
- 유연한 조정 가능

**단점**:
- 구현 복잡도 중간

---

## 권장 구현 전략

### Phase 1: 즉시 적용 (단기)

1. **연결 수 기반 크기 보정** (방안 2)
   - 구현 간단
   - 즉시 효과
   - 허브 노드 자동 강조

2. **크기 범위 확대**
   - 현재: 0.7x ~ 1.2x
   - 개선: 0.6x ~ 1.5x (더 명확한 차별화)

### Phase 2: 데이터 기반 개선 (중기)

3. **지분율 기반 크기 보정** (방안 3)
   - 지분율 데이터 활용
   - 비즈니스 인사이트 강화

4. **동적 크기 캐싱**
   - 계산 결과 캐싱으로 성능 최적화

### Phase 3: 고급 기능 (장기)

5. **사용자 설정 가능한 크기 정책**
   - 크기 기준 선택 (연결 수 / 지분율 / 혼합)
   - 크기 범위 조정

6. **애니메이션 전환**
   - 크기 변경 시 부드러운 전환 효과

---

## 구현 예시 코드

```javascript
// frontend/graph.js에 추가

/**
 * CTO: 노드 크기 계산 함수 (데이터 기반 동적 크기)
 * @param {Object} node - 노드 객체
 * @param {Array} edges - 엣지 배열
 * @param {string|null} selectedNodeId - 선택된 노드 ID
 * @param {Set} connectedNodeIds - 연결된 노드 ID Set
 * @returns {number} 계산된 노드 크기 (px)
 */
function calculateNodeSize(node, edges, selectedNodeId, connectedNodeIds) {
  const baseRadius = NODE_RADIUS[node.type] || 18;
  const baseSize = baseRadius * 2;
  
  // 연결 수 계산
  const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  
  // 전체 노드의 평균 연결 수 계산 (캐싱 가능)
  if (!window._avgDegree) {
    const allDegrees = NODES.map(n => 
      edges.filter(e => e.from === n.id || e.to === n.id).length
    );
    window._avgDegree = allDegrees.reduce((a, b) => a + b, 0) / Math.max(allDegrees.length, 1);
  }
  const avgDegree = window._avgDegree;
  
  // 연결 수 기반 크기 보정
  let degreeFactor = 1.0;
  if (degree > avgDegree * 1.5) {
    degreeFactor = 1.25;  // 고연결: +25%
  } else if (degree > avgDegree) {
    degreeFactor = 1.1;   // 중연결: +10%
  } else if (degree < avgDegree * 0.5 && degree > 0) {
    degreeFactor = 0.9;   // 저연결: -10%
  }
  
  // 지분율 기반 크기 보정 (선택적)
  let ratioFactor = 1.0;
  if (nodeEdges.length > 0) {
    const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)));
    if (maxRatio > 20) {
      ratioFactor = 1.15;  // 20% 이상: +15%
    } else if (maxRatio > 10) {
      ratioFactor = 1.08;  // 10% 이상: +8%
    }
  }
  
  // 상태별 조정
  const isSelected = selectedNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);
  let stateFactor = 1.0;
  if (isSelected) {
    stateFactor = 1.2;    // 선택: +20%
  } else if (!isConnected && selectedNodeId) {
    stateFactor = 0.7;    // 비연결: -30%
  }
  
  // 최종 크기 계산
  const finalSize = baseSize * degreeFactor * ratioFactor * stateFactor;
  
  // 크기 제한 (가독성 보장)
  const minSize = Math.max(16, baseSize * 0.6);
  const maxSize = Math.min(80, baseSize * 1.8);
  return Math.max(minSize, Math.min(maxSize, finalSize));
}

// renderGraphWithVisJs() 함수에서 사용
const visNodes = visibleNodes.map(n => {
  // ... 기존 코드 ...
  const nodeSize = calculateNodeSize(n, visibleEdges, selectedNodeId, connectedNodeIds);
  // ... 나머지 코드 ...
});
```

---

## 성능 고려사항

1. **캐싱 전략**
   - 평균 연결 수는 한 번만 계산하여 캐싱
   - 노드 크기는 데이터 변경 시에만 재계산

2. **계산 최적화**
   - 연결 수 계산을 Map으로 최적화
   - 불필요한 반복 제거

3. **렌더링 최적화**
   - 크기 변경 시 부드러운 전환 (CSS transition)
   - 대량 노드에서는 크기 범위 제한

---

## 테스트 체크리스트

- [ ] 연결 수가 많은 노드가 더 크게 표시되는지 확인
- [ ] 지분율이 높은 노드가 더 크게 표시되는지 확인
- [ ] 선택된 노드가 명확하게 강조되는지 확인
- [ ] 비연결 노드가 적절히 축소되는지 확인
- [ ] 크기 범위가 가독성을 해치지 않는지 확인
- [ ] 성능 저하가 없는지 확인 (4,919개 노드 기준)

---

## 결론 및 권장사항

**즉시 적용 권장**: 방안 2 (단순화된 크기 계층 구조)
- 구현 간단
- 즉시 효과
- 성능 영향 최소

**중기 개선 권장**: 방안 3 (하이브리드 접근)
- 데이터 기반 자동 강조
- 비즈니스 인사이트 강화
- 사용자 경험 개선

**우선순위**:
1. 🔴 연결 수 기반 크기 보정 (즉시)
2. 🟡 지분율 기반 크기 보정 (중기)
3. 🟢 사용자 설정 기능 (장기)

---

**검토자**: CTO (AI Assistant)  
**다음 검토 예정일**: 구현 후 성능 및 UX 검증
