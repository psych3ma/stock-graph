# UX 전문가 출신 CTO: 엣지 라벨 가독성 문제 해결

**일시**: 2026-02-17  
**우선순위**: 🔴 Critical (데이터 해석 불가능)  
**상태**: 📋 문제 분석 완료, 해결 방안 제시

---

## 발견된 Critical UX Issues

### 1. 엣지 라벨 겹침 문제 🔴

**문제점**:
- 이미지에서 확인: "3.2% (22.0% (2건))" - 라벨이 겹쳐서 읽을 수 없음
- 백엔드에서 잘못된 데이터 형식이 전달되거나, 프론트엔드에서 중복 포맷팅 가능성
- 사용자가 데이터를 해석할 수 없음

**영향도**:
- **심각도**: Critical
- **사용자 영향**: 핵심 정보(지분율) 확인 불가능
- **재현 가능성**: 데이터에 따라 발생

---

### 2. 모호한 라벨 표시 🔴

**문제점**:
- "0.0% (2건)" - 0%인데 2건이 있다는 의미가 불명확
- 사용자가 이 정보를 어떻게 해석해야 할지 모름

**영향도**:
- **심각도**: High
- **사용자 영향**: 데이터 해석 혼란

---

### 3. 엣지 라벨 정보 과부하 🟡

**문제점**:
- 모든 엣지에 라벨 표시로 인한 시각적 혼란
- 밀집된 영역에서 라벨이 겹침
- 줌 레벨과 관계없이 모든 라벨 표시

**영향도**:
- **심각도**: Medium
- **사용자 영향**: 가독성 저하

---

## 근본 원인 분석

### 1. 엣지 라벨 포맷팅 로직 문제

**현재 코드**:
```javascript
const maxRatio = Math.max(...edges.map(ed => Number(ed.ratio || 0)));
const relCount = edges.reduce((sum, ed) => sum + Number(ed.count || 1), 0);
const ratio = Math.max(0, Math.min(100, maxRatio));

let label = `${ratio.toFixed(1)}%`;
if (relCount > 1) {
  label = `${ratio.toFixed(1)}% (${relCount}건)`;
}
```

**가능한 문제**:
- 백엔드에서 `ratio` 필드에 이미 포맷된 문자열이 올 수 있음 (예: "22.0%")
- 프론트엔드에서 다시 포맷팅하여 중복 발생 가능
- `ed.ratio`가 문자열일 경우 `Number()` 변환 실패 가능

---

### 2. 엣지 라벨 표시 조건 부재

**현재 상태**:
- 모든 엣지에 라벨 표시
- 줌 레벨 기반 필터링 없음
- 중요도 기반 필터링 없음

**문제점**:
- 밀집된 영역에서 라벨이 겹침
- 시각적 혼란 증가

---

## 해결 방안

### 방안 1: 엣지 라벨 포맷팅 로직 강화 (즉시 적용) ⭐⭐⭐

**개념**: 안전한 숫자 변환 및 명확한 라벨 포맷팅

**구현**:
```javascript
function formatEdgeLabel(edges) {
  // 안전한 숫자 추출 함수
  const safeNumber = (val) => {
    if (val == null || val === '') return 0;
    if (typeof val === 'string') {
      // 문자열에서 숫자만 추출 (예: "22.0%" → 22.0)
      const match = val.toString().match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    }
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  };
  
  // 최대 지분율 계산
  const ratios = edges.map(ed => safeNumber(ed.ratio));
  const maxRatio = Math.max(...ratios, 0);
  const ratio = Math.max(0, Math.min(100, maxRatio));
  
  // 관계 건수 계산
  const relCount = edges.reduce((sum, ed) => {
    const count = safeNumber(ed.count);
    return sum + (count > 0 ? count : 1);
  }, 0);
  
  // 라벨 포맷팅
  if (ratio === 0 && relCount > 0) {
    // 0%인데 관계가 있는 경우: 건수만 표시
    return relCount > 1 ? `${relCount}건` : '';
  }
  
  if (relCount > 1) {
    return `${ratio.toFixed(1)}% (${relCount}건)`;
  }
  
  return `${ratio.toFixed(1)}%`;
}
```

---

### 방안 2: 줌 레벨 기반 엣지 라벨 표시 (즉시 적용) ⭐⭐⭐

**개념**: 줌 레벨이 높을 때만 엣지 라벨 표시

**구현**:
```javascript
const visEdges = Array.from(edgeMap.entries()).map(([key, edges]) => {
  // ... 기존 코드 ...
  
  const currentZoom = visNetwork ? visNetwork.getScale() : 1.0;
  const minZoomForEdgeLabels = 1.5; // 엣지 라벨 표시 최소 줌 레벨
  
  // 라벨 표시 조건
  let edgeLabel = '';
  if (currentZoom >= minZoomForEdgeLabels || isConnected) {
    // 줌 레벨이 높거나 연결된 엣지는 라벨 표시
    edgeLabel = formatEdgeLabel(edges);
  }
  
  return {
    // ...
    label: edgeLabel,
    // ...
  };
});
```

---

### 방안 3: 중요도 기반 엣지 라벨 필터링 (중기) ⭐⭐

**개념**: 지분율이 높은 엣지만 라벨 표시

**구현**:
```javascript
const minRatioForLabel = 1.0; // 라벨 표시 최소 지분율 (%)

const visEdges = Array.from(edgeMap.entries()).map(([key, edges]) => {
  // ... 기존 코드 ...
  
  const ratio = Math.max(0, Math.min(100, maxRatio));
  
  // 중요도 기반 필터링
  let edgeLabel = '';
  if (ratio >= minRatioForLabel || isConnected) {
    edgeLabel = formatEdgeLabel(edges);
  }
  
  return {
    // ...
    label: edgeLabel,
    // ...
  };
});
```

---

### 방안 4: 엣지 라벨 툴팁 (장기) ⭐⭐

**개념**: 라벨 대신 호버 시 툴팁으로 상세 정보 표시

**구현**:
```javascript
network.on('hoverEdge', (params) => {
  const edge = visNetwork.body.data.edges.get(params.edge);
  if (edge) {
    // 엣지 상세 정보 툴팁 표시
    showEdgeTooltip(edge, params.event.x, params.event.y);
  }
});
```

---

## 권장 구현 전략

### Phase 1: 즉시 적용 (Critical)

1. **엣지 라벨 포맷팅 강화** (방안 1)
   - 안전한 숫자 변환
   - 명확한 라벨 포맷팅
   - 0% 처리 개선

2. **줌 레벨 기반 엣지 라벨 표시** (방안 2)
   - 줌 레벨 1.5 이상에서만 표시
   - 연결된 엣지는 항상 표시

### Phase 2: 중기 개선

3. **중요도 기반 필터링** (방안 3)
   - 지분율 1% 이상만 표시
   - 정보 밀도 관리

### Phase 3: 장기 개선

4. **엣지 툴팁** (방안 4)
   - 호버 시 상세 정보 표시
   - 라벨 대신 사용

---

## 즉시 적용 코드

### 1. 안전한 엣지 라벨 포맷팅 함수

```javascript
/**
 * UX: 안전한 엣지 라벨 포맷팅 함수
 * @param {Array} edges - 엣지 배열
 * @returns {string} 포맷된 라벨 문자열
 */
function formatEdgeLabel(edges) {
  // 안전한 숫자 추출 함수
  const safeNumber = (val) => {
    if (val == null || val === '') return 0;
    if (typeof val === 'string') {
      // 문자열에서 숫자만 추출 (예: "22.0%" → 22.0, "3.2%" → 3.2)
      const cleaned = val.toString().replace(/[^\d.]/g, '');
      const num = parseFloat(cleaned);
      return Number.isNaN(num) ? 0 : num;
    }
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  };
  
  // 최대 지분율 계산
  const ratios = edges.map(ed => safeNumber(ed.ratio));
  const maxRatio = Math.max(...ratios, 0);
  const ratio = Math.max(0, Math.min(100, maxRatio));
  
  // 관계 건수 계산
  const relCount = edges.reduce((sum, ed) => {
    const count = safeNumber(ed.count);
    return sum + (count > 0 ? count : 1);
  }, 0);
  
  // UX: 0%인데 관계가 있는 경우 처리
  if (ratio === 0 && relCount > 0) {
    // 0%인데 관계가 있는 경우: 건수만 표시하거나 숨김
    // 사용자 혼란 방지를 위해 건수가 많을 때만 표시
    return relCount > 5 ? `${relCount}건` : '';
  }
  
  // UX: 라벨 포맷팅 (명확하고 간결하게)
  if (relCount > 1) {
    return `${ratio.toFixed(1)}% (${relCount}건)`;
  }
  
  return `${ratio.toFixed(1)}%`;
}
```

### 2. 줌 레벨 기반 엣지 라벨 표시

```javascript
const visEdges = Array.from(edgeMap.entries()).map(([key, edges]) => {
  // ... 기존 코드 ...
  
  const currentZoom = visNetwork ? visNetwork.getScale() : 1.0;
  const minZoomForEdgeLabels = 1.5; // UX: 엣지 라벨 표시 최소 줌 레벨
  
  // UX: 줌 레벨 기반 라벨 표시
  let edgeLabel = '';
  if (currentZoom >= minZoomForEdgeLabels || isConnected) {
    // 줌 레벨이 높거나 연결된 엣지는 라벨 표시
    edgeLabel = formatEdgeLabel(edges);
    
    // UX: 중요도 기반 추가 필터링 (지분율 1% 미만은 숨김)
    if (edgeLabel && ratio < 1.0 && !isConnected) {
      edgeLabel = '';
    }
  }
  
  return {
    from: e.from,
    to: e.to,
    label: edgeLabel, // UX: 조건부 라벨 표시
    // ... 나머지 설정 ...
  };
});
```

---

## 테스트 체크리스트

- [ ] 엣지 라벨이 겹치지 않는지 확인
- [ ] "0.0% (2건)" 같은 모호한 라벨이 개선되었는지 확인
- [ ] 줌 아웃 시 엣지 라벨이 숨겨지는지 확인
- [ ] 줌 인 시 엣지 라벨이 표시되는지 확인
- [ ] 연결된 엣지의 라벨이 항상 표시되는지 확인
- [ ] 지분율 1% 미만 엣지의 라벨이 숨겨지는지 확인
- [ ] 라벨 포맷이 명확하고 읽기 쉬운지 확인

---

## 결론

**즉시 적용 권장**: 방안 1 (엣지 라벨 포맷팅 강화) + 방안 2 (줌 레벨 기반 표시)

이 두 가지를 즉시 적용하면:
- 엣지 라벨 겹침 문제 해결
- 모호한 라벨 개선
- 가독성 향상
- 정보 밀도 관리

---

**작성자**: UX 전문가 출신 CTO (AI Assistant)  
**다음 검토 예정일**: 구현 후 사용성 테스트
