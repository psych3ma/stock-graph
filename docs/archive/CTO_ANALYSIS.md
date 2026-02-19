# CTO 전문가 관점 분석 보고서

**분석 일자**: 2026-02-17  
**분석 대상**: GraphIQ 서비스 (백엔드 + 프론트엔드)  
**문제**: 노드 클러스터링, 엣지 미표시, 레이블 렌더링 실패

---

## 🔴 Critical Issues (즉시 수정 필요)

### 1. **프론트엔드: 엣지 렌더링 실패**

**문제점**:
```javascript
// frontend/graph.html:899-902
EDGES.forEach(e => {
  if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return;
  const p1 = positions[e.from], p2 = positions[e.to];
  if (!p1 || !p2) return; // ⚠️ positions가 없으면 엣지가 렌더링되지 않음
```

**근본 원인**:
- `initPositions()`가 실행되기 전에 `renderGraph()`가 호출될 수 있음
- `positions` 객체가 초기화되지 않은 상태에서 엣지 렌더링 시도
- 비동기 타이밍 이슈: `loadGraph()` → `initPositions()` → `renderGraph()` 순서가 보장되지 않음

**영향**: 
- 엣지가 전혀 표시되지 않음 (이미지에서 확인됨)
- 그래프의 핵심 정보(관계)가 손실됨

**해결책**:
```javascript
// renderGraph() 시작 부분에 가드 추가
function renderGraph() {
  if (NODES.length === 0 || Object.keys(positions).length === 0) {
    return; // positions가 없으면 렌더링 스킵
  }
  // ... 기존 코드
}
```

---

### 2. **프론트엔드: 노드 레이블 렌더링 실패**

**문제점**:
```javascript
// frontend/graph.html:999-1002
if (isSelected) {
  const label = document.createElementNS('http://www.w3.org/2000/svg','text');
  label.textContent = n.label.length > 15 ? n.label.slice(0,15)+'…' : n.label;
  g.appendChild(label);
}
```

**근본 원인**:
- 레이블이 **선택된 노드에만** 표시됨 (`isSelected` 조건)
- 이미지에서 대부분의 노드가 단일 문자('(', '우', '스' 등)만 보이는 이유
- `n.label`이 제대로 전달되지 않거나 잘못 파싱됨

**영향**:
- 사용자가 노드를 식별할 수 없음
- 그래프가 의미 없는 원들의 집합으로 보임

**해결책**:
```javascript
// 모든 노드에 레이블 표시 (선택 여부와 무관)
const label = document.createElementNS('http://www.w3.org/2000/svg','text');
label.textContent = (n.label || 'Unknown').length > 15 
  ? (n.label || 'Unknown').slice(0,15)+'…' 
  : (n.label || 'Unknown');
// ... 위치 설정
g.appendChild(label);
```

---

### 3. **프론트엔드: 레이아웃 알고리즘 실패**

**문제점**:
```javascript
// frontend/graph.html:814-834
companies.forEach((n, i) => {
  const cols = Math.ceil(Math.sqrt(companies.length * 2.0));
  const col = i % cols;
  const row = Math.floor(i / cols);
  positions[n.id] = {
    x: startX + col * cellW * 1.2,
    y: startY + row * cellH * 1.2,
  };
});
```

**근본 원인**:
1. **초기 배치가 격자 기반**: 노드들이 격자에 고정되어 자연스러운 분산이 안 됨
2. **Force-directed 알고리즘이 불충분**: 200회 반복해도 초기 위치가 나쁘면 수렴 실패
3. **반발력/인력 불균형**: 반발력은 강하지만 인력이 약해서 노드들이 흩어지지 않고 클러스터 유지
4. **경계 제약이 너무 강함**: `padding=150px`로 인해 사용 가능 공간이 제한됨

**영향**:
- 노드들이 왼쪽에만 몰려있음 (이미지 확인)
- 오른쪽 공간이 비어있음
- 그래프가 읽기 불가능한 상태

**해결책**:
```javascript
// 1. 초기 배치를 랜덤/원형으로 변경
const angle = (i / allNodes.length) * Math.PI * 2;
const radius = Math.min(W, H) * 0.3;
positions[n.id] = {
  x: cx + Math.cos(angle) * radius * (0.5 + Math.random() * 0.5),
  y: cy + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5),
};

// 2. Force-directed 알고리즘 강화
// - 반복 횟수 증가: 200 → 300
// - 반발력 범위 확대: minDist * 2.0 → minDist * 3.0
// - 인력 조정: idealDist를 동적으로 계산

// 3. 경계 제약 완화
const padding = 50; // 150 → 50
```

---

### 4. **백엔드: 데이터 일관성 문제**

**문제점**:
```python
# backend/app/api/v1/endpoints/graph.py:58-68
rows = graph.query(q, params={"limit": limit, "search": search})
nodes.extend(
  {
    "id": f"n{r['id']}",
    "type": "company",
    "label": r.get("label") or "Unknown",  # ⚠️ label이 None일 수 있음
    ...
  }
)
```

**근본 원인**:
- `r.get("label")`이 `None`을 반환할 수 있음
- Neo4j 쿼리에서 `c.companyName`이 `NULL`일 수 있음
- 프론트엔드에서 `n.label`이 `undefined` 또는 빈 문자열일 수 있음

**영향**:
- 레이블이 표시되지 않음
- 노드 식별 불가

**해결책**:
```python
# 백엔드에서 기본값 보장
"label": (r.get("label") or r.get("companyName") or r.get("stockName") or "Unknown").strip(),
```

---

## ⚠️ High Priority Issues

### 5. **프론트엔드: 비동기 타이밍 이슈**

**문제점**:
```javascript
// frontend/graph.html:696-702
initPositions();
renderGraph();
setTimeout(() => {
  fitToView();
  renderGraph();
}, 200);
```

**근본 원인**:
- `initPositions()`가 동기적으로 실행되지만, force-directed 알고리즘이 200회 반복되므로 시간이 걸림
- `setTimeout(200ms)`가 부족할 수 있음
- `fitToView()`가 `positions`가 완전히 계산되기 전에 실행될 수 있음

**해결책**:
```javascript
// initPositions()를 Promise로 감싸서 완료 보장
async function initPositions() {
  return new Promise(resolve => {
    // ... 기존 로직
    // force-directed 알고리즘을 requestAnimationFrame으로 분할
    let iter = 0;
    function step() {
      // 한 번에 10회씩 반복
      for (let i = 0; i < 10 && iter < 200; i++, iter++) {
        // ... force 계산
      }
      if (iter < 200) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    step();
  });
}

// loadGraph()에서
await initPositions();
renderGraph();
fitToView();
renderGraph();
```

---

### 6. **백엔드: 성능 최적화 부족**

**문제점**:
```python
# backend/app/api/v1/endpoints/graph.py:125-133
query = """
    MATCH (s:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
    WHERE $ids IS NULL OR id(s) IN $ids OR id(c) IN $ids
    RETURN id(s) AS fromId, id(c) AS toId, r.stockRatio AS ratio
    ORDER BY r.stockRatio DESC
    LIMIT $limit
"""
```

**근본 원인**:
- `id(s) IN $ids` 조건이 인덱스를 활용하지 못할 수 있음
- `ORDER BY`가 모든 관계를 정렬한 후 `LIMIT` 적용 (비효율적)
- 대량의 관계가 있을 때 성능 저하

**해결책**:
```python
# 인덱스 활용 및 쿼리 최적화
query = """
    MATCH (s:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
    WHERE ($ids IS NULL OR id(s) IN $ids OR id(c) IN $ids)
    WITH r, s, c
    ORDER BY r.stockRatio DESC
    LIMIT $limit
    RETURN id(s) AS fromId, id(c) AS toId, r.stockRatio AS ratio
"""
```

---

## 📊 Architecture Issues

### 7. **프론트엔드: 상태 관리 부재**

**문제점**:
- 전역 변수로 상태 관리 (`NODES`, `EDGES`, `positions`)
- 상태 변경 시 일관성 보장 어려움
- 디버깅이 어려움

**해결책**:
- 상태 관리 라이브러리 도입 (Redux, Zustand 등) 또는 최소한 상태 객체로 통합
- 상태 변경 로그 추가

---

### 8. **에러 핸들링 부족**

**문제점**:
```javascript
// frontend/graph.html:899-902
EDGES.forEach(e => {
  if (!p1 || !p2) return; // 조용히 실패
});
```

**근본 원인**:
- 에러가 조용히 무시됨
- 디버깅이 어려움
- 사용자에게 피드백 없음

**해결책**:
```javascript
if (!p1 || !p2) {
  console.warn(`Edge ${e.from} -> ${e.to} skipped: missing positions`);
  return;
}
```

---

## 🎯 Immediate Action Items

### Priority 1 (Critical - 즉시 수정)
1. ✅ **엣지 렌더링 가드 추가**: `positions` 체크
2. ✅ **노드 레이블 항상 표시**: `isSelected` 조건 제거
3. ✅ **초기 배치 알고리즘 개선**: 격자 → 원형/랜덤
4. ✅ **Force-directed 알고리즘 강화**: 반복 횟수, 힘 조정

### Priority 2 (High - 이번 주 내)
5. ✅ **비동기 타이밍 수정**: `initPositions()` Promise화
6. ✅ **백엔드 기본값 보장**: `label` null 체크
7. ✅ **에러 핸들링 강화**: 콘솔 로그 추가

### Priority 3 (Medium - 다음 스프린트)
8. ✅ **상태 관리 개선**: 전역 변수 → 상태 객체
9. ✅ **성능 최적화**: 쿼리 인덱스 활용
10. ✅ **테스트 코드 추가**: 렌더링 로직 단위 테스트

---

## 📈 예상 개선 효과

### Before (현재 상태)
- ❌ 엣지 표시율: ~0% (거의 안 보임)
- ❌ 노드 레이블 표시율: ~5% (선택된 노드만)
- ❌ 공간 활용률: ~30% (왼쪽에만 몰림)
- ❌ 사용자 만족도: 매우 낮음

### After (수정 후 예상)
- ✅ 엣지 표시율: 100% (모든 관계 표시)
- ✅ 노드 레이블 표시율: 100% (모든 노드)
- ✅ 공간 활용률: 80%+ (균등 분산)
- ✅ 사용자 만족도: 높음

---

## 🔧 기술 부채 (Technical Debt)

1. **코드 중복**: `renderGraph()` 내부에 중복 로직 다수
2. **매직 넘버**: `150`, `200`, `250` 등 하드코딩된 값들
3. **하드코딩된 스타일**: CSS 값들이 JavaScript에 하드코딩
4. **테스트 부재**: 프론트엔드 렌더링 로직 테스트 없음

---

## 💡 권장 사항

### 단기 (1주일)
1. Critical Issues 수정 (Priority 1)
2. 에러 핸들링 강화
3. 콘솔 로그 추가로 디버깅 용이성 향상

### 중기 (1개월)
1. 상태 관리 개선
2. 성능 최적화
3. 단위 테스트 추가

### 장기 (3개월)
1. 컴포넌트화 (React/Vue 등 프레임워크 고려)
2. E2E 테스트 추가
3. 모니터링/로깅 시스템 구축

---

**분석 완료**: 2026-02-17  
**다음 리뷰 예정**: 수정 사항 적용 후
