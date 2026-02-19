# CTO 전문가 관점: 그래프 레이아웃 원리 비교 분석

**검토 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드  
**비교 대상**: 타 서비스 GraphManager vs 현재 프로젝트 구현

---

## 🎯 핵심 차이점: 그래프가 뭉치지 않는 원리

### 타 서비스 접근 방식

**핵심 원리**: **Physics 활성화 → 안정화 완료 → Physics 비활성화**

```javascript
// 타 서비스: GraphManager.js
physics: {
  solver: 'forceAtlas2Based',
  forceAtlas2Based: {
    gravitationalConstant: -60,
    centralGravity: 0.005,
    springLength: 150,
    springConstant: 0.04,
    damping: 0.6,
    avoidOverlap: 0.6  // ⭐ 핵심: 노드 겹침 방지
  },
  stabilization: {
    enabled: true,
    iterations: 100,
    fit: true
  }
}

// 안정화 완료 후 Physics 비활성화
network.on('stabilizationIterationsDone', () => {
  network.setOptions({ physics: false });  // ⭐ 핵심: 안정화 후 고정
});
```

**작동 원리**:
1. **초기 렌더링**: Physics 활성화 상태로 노드들이 자동으로 배치됨
2. **안정화 과정**: ForceAtlas2 알고리즘이 노드 간 반발력/인력 계산
3. **안정화 완료**: `stabilizationIterationsDone` 이벤트 발생
4. **Physics 비활성화**: 안정화된 위치에 노드 고정
5. **Fit 실행**: 안정화 완료 후 화면에 맞게 조정

**장점**:
- ✅ Vis.js의 검증된 레이아웃 알고리즘 활용
- ✅ `avoidOverlap: 0.6`으로 노드 겹침 방지
- ✅ 자동으로 최적 위치 계산
- ✅ 안정화 후 고정으로 성능 최적화

---

### 현재 프로젝트 접근 방식

**핵심 원리**: **서버/클라이언트 레이아웃 계산 → 고정 좌표 사용**

```javascript
// 현재 프로젝트: graph.js
physics: { enabled: false },  // ⚠️ Physics 비활성화

// 고정 좌표 사용
fixed: { x: true, y: true },  // ⚠️ 고정 좌표

// 클라이언트 Force-directed 레이아웃
function initPositions() {
  // Force simulation 직접 구현
  // 반발력/인력 계산
  // 최종 좌표 계산
}
```

**작동 원리**:
1. **서버 레이아웃 시도**: PyGraphviz로 레이아웃 계산
2. **클라이언트 레이아웃 폴백**: 서버 실패 시 클라이언트 Force-directed
3. **좌표 계산**: `initPositions()`에서 직접 구현한 Force simulation
4. **고정 좌표**: 계산된 좌표를 `fixed: { x: true, y: true }`로 고정
5. **Physics 비활성화**: Vis.js physics 미사용

**문제점**:
- ⚠️ Vis.js의 자동 레이아웃 기능 미활용
- ⚠️ 대용량 데이터에서 레이아웃 알고리즘 한계
- ⚠️ 노드 겹침 방지가 완벽하지 않을 수 있음

---

## 📊 상세 비교 분석

### 1. Physics 엔진 사용 방식

| 항목 | 타 서비스 | 현재 프로젝트 | 차이점 |
|------|----------|-------------|--------|
| **Physics 활성화** | ✅ 조건부 활성화 | ❌ 항상 비활성화 | 타 서비스는 안정화 전에 활성화 |
| **Solver** | `forceAtlas2Based` | 없음 (직접 구현) | 타 서비스는 Vis.js 내장 알고리즘 사용 |
| **안정화 프로세스** | ✅ `stabilizationIterationsDone` | ❌ 없음 | 타 서비스는 안정화 이벤트 활용 |
| **Physics 비활성화 시점** | 안정화 완료 후 | 항상 비활성화 | 타 서비스는 안정화 후 고정 |

**CTO 관점 분석**:

#### 호환성 (Compatibility)
- **타 서비스**: ✅ Vis.js 표준 API 사용, 브라우저 호환성 우수
- **현재 프로젝트**: ✅ 직접 구현으로 제어 가능, 하지만 Vis.js 기능 미활용

#### 일관성 (Consistency)
- **타 서비스**: ✅ Vis.js 표준 패턴 사용, 다른 프로젝트와 일관성
- **현재 프로젝트**: ⚠️ 커스텀 구현으로 인한 일관성 부족 가능성

#### 유지보수성 (Maintainability)
- **타 서비스**: ✅ Vis.js 업데이트 시 자동 개선, 코드 간결
- **현재 프로젝트**: ⚠️ 직접 구현으로 유지보수 부담, 알고리즘 개선 필요

#### 확장성 (Scalability)
- **타 서비스**: ✅ Vis.js 최적화 활용, 대용량 데이터 처리 우수
- **현재 프로젝트**: ⚠️ 직접 구현으로 성능 최적화 한계

#### 협업 코드 (Collaborative Code)
- **타 서비스**: ✅ 표준 패턴 사용, 이해하기 쉬움
- **현재 프로젝트**: ⚠️ 커스텀 로직으로 학습 곡선 존재

---

### 2. 레이아웃 알고리즘 비교

#### 타 서비스: ForceAtlas2Based

```javascript
forceAtlas2Based: {
  gravitationalConstant: -60,    // 중력 상수 (음수 = 반발)
  centralGravity: 0.005,         // 중심 중력
  springLength: 150,             // 스프링 길이
  springConstant: 0.04,          // 스프링 상수
  damping: 0.6,                  // 감쇠
  avoidOverlap: 0.6              // ⭐ 노드 겹침 방지 (0-1)
}
```

**특징**:
- ✅ **검증된 알고리즘**: ForceAtlas2는 네트워크 그래프에 최적화
- ✅ **노드 겹침 방지**: `avoidOverlap` 파라미터로 자동 처리
- ✅ **자동 최적화**: Vis.js가 내부적으로 최적화 수행

#### 현재 프로젝트: 커스텀 Force-directed

```javascript
// LAYOUT_CONFIG.force
minDist: 800,
repulsionStrength: 600,
collisionRadiusMultiplier: 8.0,
idealDistMin: 800,
idealDistMax: 2000,
// ...
```

**특징**:
- ✅ **세밀한 제어**: 파라미터를 직접 조정 가능
- ⚠️ **구현 복잡도**: 직접 구현으로 코드 복잡
- ⚠️ **최적화 한계**: Vis.js의 최적화 미활용

---

### 3. 안정화 프로세스 비교

#### 타 서비스: 이벤트 기반 안정화

```javascript
// 안정화 완료 이벤트 리스너
network.on('stabilizationIterationsDone', () => {
  network.setOptions({ physics: false });  // Physics 비활성화
  if (this._fitAfterStabilization) {
    network.fit({ animation: { duration: 400 } });
  }
});
```

**장점**:
- ✅ **명확한 시점**: 안정화 완료 시점을 정확히 알 수 있음
- ✅ **자동 처리**: Vis.js가 안정화 완료를 감지
- ✅ **UX 최적화**: 안정화 후 fit으로 화면에 맞게 조정

#### 현재 프로젝트: 수동 안정화

```javascript
// Force simulation 반복
for (let i = 0; i < batchSize && iter < maxIter; i++, iter++) {
  // 반복 계산
}
// 최종 충돌 해소
do {
  // 충돌 해소 로직
} while (hasOverlap && overlapIterations < 50);
```

**특징**:
- ⚠️ **수동 제어**: 반복 횟수를 직접 관리
- ⚠️ **안정화 시점 불명확**: 언제 완료되었는지 명확하지 않음
- ⚠️ **충돌 해소 로직**: 별도로 구현 필요

---

### 4. 노드 겹침 방지 비교

#### 타 서비스: `avoidOverlap` 파라미터

```javascript
avoidOverlap: 0.6  // 0-1 사이 값, 높을수록 겹침 방지 강화
```

**작동 원리**:
- Vis.js가 내부적으로 노드 간 거리 계산
- `avoidOverlap` 값에 따라 반발력 조정
- 자동으로 노드 겹침 방지

#### 현재 프로젝트: 충돌 감지 및 분리

```javascript
// 충돌 감지
const collisionRadius = (r + otherR) * collisionMult;
if (dist < collisionRadius) {
  // 강제 분리
  const force = t * t * (effectiveStrength * 2);
  fx += (dx / dist) * force;
  fy += (dy / dist) * force;
}

// 최종 충돌 해소
do {
  // 물리적 반지름 기준 분리
  if (dist < minSep) {
    const separation = (minSep - dist) / 2;
    // 위치 조정
  }
} while (hasOverlap && overlapIterations < 50);
```

**특징**:
- ✅ **세밀한 제어**: 충돌 감지 로직을 직접 제어
- ⚠️ **복잡도**: 구현이 복잡하고 유지보수 어려움
- ⚠️ **성능**: 대용량 데이터에서 성능 이슈 가능

---

## 🔍 그래프가 뭉치지 않는 원리 분석

### 타 서비스: Physics 기반 자동 레이아웃

**핵심 메커니즘**:

1. **초기 배치**: Physics 활성화 상태로 노드들이 랜덤/초기 위치에서 시작
2. **Force 계산**: ForceAtlas2 알고리즘이 노드 간 힘 계산
   - **반발력**: `gravitationalConstant: -60` (음수 = 반발)
   - **인력**: `springLength: 150`, `springConstant: 0.04` (연결된 노드 간 인력)
   - **겹침 방지**: `avoidOverlap: 0.6` (노드 간 최소 거리 보장)
3. **안정화**: 반복 계산으로 노드들이 최적 위치로 이동
4. **고정**: 안정화 완료 후 Physics 비활성화하여 위치 고정

**코드 위치**:
```javascript
// GraphManager.js: getNetworkOptions()
physics: {
  solver: 'forceAtlas2Based',
  forceAtlas2Based: {
    avoidOverlap: 0.6  // ⭐ 핵심: 노드 겹침 방지
  },
  stabilization: {
    enabled: true,
    iterations: 100
  }
}

// GraphManager.js: setupStabilizationAndResize()
network.on('stabilizationIterationsDone', () => {
  network.setOptions({ physics: false });  // ⭐ 안정화 후 고정
});
```

---

### 현재 프로젝트: 수동 Force-directed 레이아웃

**핵심 메커니즘**:

1. **초기 배치**: 원형/격자 패턴으로 초기 위치 배치
2. **Force 계산**: 직접 구현한 Force simulation
   - **반발력**: `repulsionStrength: 600`
   - **충돌 감지**: `collisionRadiusMultiplier: 8.0`
   - **이상 거리**: `idealDistMin: 800`, `idealDistMax: 2000`
3. **반복 계산**: `maxIter: 1200`번 반복
4. **충돌 해소**: 최종적으로 노드 겹침 해소
5. **고정**: 계산된 좌표를 `fixed: { x: true, y: true }`로 고정

**코드 위치**:
```javascript
// graph.js: initPositions() (라인 1047-1304)
// Force simulation 직접 구현
const cfg = LAYOUT_CONFIG.force;
const repulsionStrength = cfg.repulsionStrength;  // 600
const collisionMult = cfg.collisionRadiusMultiplier;  // 8.0

// 반발력 계산
if (dist < collisionRadius) {
  const force = t * t * (effectiveStrength * 2);
  fx += (dx / dist) * force;
}

// 최종 충돌 해소
do {
  if (dist < minSep) {
    const separation = (minSep - dist) / 2;
    // 위치 조정
  }
} while (hasOverlap && overlapIterations < 50);
```

---

## 🎯 핵심 차이점 요약

### 1. 레이아웃 계산 방식

| 항목 | 타 서비스 | 현재 프로젝트 |
|------|----------|-------------|
| **방식** | Vis.js Physics (ForceAtlas2) | 커스텀 Force-directed |
| **알고리즘** | 검증된 알고리즘 | 직접 구현 |
| **노드 겹침 방지** | `avoidOverlap: 0.6` | 충돌 감지 + 분리 로직 |
| **안정화** | 이벤트 기반 (`stabilizationIterationsDone`) | 수동 반복 계산 |

### 2. Physics 사용 전략

| 항목 | 타 서비스 | 현재 프로젝트 |
|------|----------|-------------|
| **초기 상태** | Physics 활성화 | Physics 비활성화 |
| **안정화 중** | Physics 활성화 (자동 레이아웃) | Physics 비활성화 (고정 좌표) |
| **안정화 후** | Physics 비활성화 (위치 고정) | Physics 비활성화 (계속) |
| **고정 방식** | 안정화 완료 후 고정 | 처음부터 고정 |

### 3. 노드 위치 관리

| 항목 | 타 서비스 | 현재 프로젝트 |
|------|----------|-------------|
| **좌표 소스** | Physics가 자동 계산 | 서버/클라이언트 레이아웃 계산 |
| **고정 여부** | 안정화 전: 동적, 후: 고정 | 항상 고정 (`fixed: { x: true, y: true }`) |
| **업데이트** | Physics가 자동 업데이트 | 수동으로 `positions` 객체 업데이트 |

---

## 💡 타 서비스의 핵심 설계 패턴

### 패턴 1: "안정화 후 고정" 전략

```javascript
// 1단계: Physics 활성화로 자동 레이아웃
physics: { enabled: true, solver: 'forceAtlas2Based' }

// 2단계: 안정화 완료 대기
network.on('stabilizationIterationsDone', () => {
  // 3단계: Physics 비활성화하여 위치 고정
  network.setOptions({ physics: false });
});
```

**장점**:
- ✅ 자동으로 최적 위치 계산
- ✅ 노드 겹침 자동 방지
- ✅ 안정화 후 성능 최적화

---

### 패턴 2: "필터링 후 재안정화" 전략

```javascript
// 필터링 시 Physics 재활성화
buildGraph(container, { fitAfterStabilization: true }) {
  // 데이터 업데이트
  this.visNodes.add(nodes);
  this.visEdges.add(edges);
  
  // Physics 재활성화
  this.network.setOptions({ physics: true });
  
  // 안정화 완료 후 fit
  if (options.fitAfterStabilization) {
    this._fitAfterStabilization = true;
  }
}
```

**장점**:
- ✅ 필터링 후 레이아웃 자동 재계산
- ✅ 새로운 노드 구성에 맞게 자동 배치
- ✅ 뭉침 문제 자동 해결

---

### 패턴 3: "안정화 후 Fit" 전략

```javascript
network.on('stabilizationIterationsDone', () => {
  network.setOptions({ physics: false });
  
  // 안정화 완료 후 화면에 맞게 조정
  if (this._fitAfterStabilization) {
    this.network.fit({ animation: { duration: 400 } });
  }
});
```

**장점**:
- ✅ 안정화된 레이아웃을 화면에 맞게 조정
- ✅ 사용자가 즉시 전체 그래프를 볼 수 있음
- ✅ UX 향상

---

## 🔄 현재 프로젝트의 문제점 분석

### 문제 1: Physics 비활성화로 인한 제약

**현재 상태**:
```javascript
physics: { enabled: false },  // 항상 비활성화
fixed: { x: true, y: true },   // 항상 고정
```

**문제점**:
- 🔴 Vis.js의 자동 레이아웃 기능 미활용
- 🔴 노드 겹침 방지 기능 미사용
- 🔴 필터링 후 레이아웃 재계산 불가능

**영향**:
- 밀집도 문제 지속
- 필터링 후에도 레이아웃이 재계산되지 않음
- 대용량 데이터에서 레이아웃 한계

---

### 문제 2: 안정화 프로세스 부재

**현재 상태**:
- 안정화 이벤트 리스너 없음
- 수동으로 반복 계산
- 안정화 완료 시점 불명확

**문제점**:
- ⚠️ 언제 레이아웃이 완료되었는지 알 수 없음
- ⚠️ 사용자에게 진행 상황 피드백 어려움
- ⚠️ 안정화 후 추가 작업 불가능

---

### 문제 3: 필터링 후 레이아웃 재계산 없음

**현재 상태**:
```javascript
function toggleFilter(el) {
  // 필터 토글
  renderGraph();  // 렌더링만 재실행
  // 레이아웃 재계산 없음
}
```

**문제점**:
- ⚠️ 필터링 후에도 기존 레이아웃 사용
- ⚠️ 노드 수가 줄어도 레이아웃이 재계산되지 않음
- ⚠️ 밀집도 문제 지속

---

## 📋 CTO 관점 권장 사항

### 전략 A: 타 서비스 패턴 적용 (권장)

**핵심 변경**:
1. Physics 조건부 활성화
2. 안정화 이벤트 리스너 추가
3. 안정화 후 Physics 비활성화
4. 필터링 후 Physics 재활성화

**장점**:
- ✅ Vis.js 표준 패턴 사용
- ✅ 노드 겹침 자동 방지
- ✅ 필터링 후 레이아웃 자동 재계산
- ✅ 코드 간결화

**단점**:
- ⚠️ 기존 서버 레이아웃 로직과 충돌 가능
- ⚠️ 마이그레이션 작업 필요

---

### 전략 B: 하이브리드 접근 (대안)

**핵심 변경**:
1. 서버 레이아웃 우선 사용 (기존 유지)
2. 서버 레이아웃 실패 시 Physics 활성화
3. 안정화 후 Physics 비활성화

**장점**:
- ✅ 기존 로직 유지
- ✅ 서버 레이아웃 실패 시 자동 폴백
- ✅ 점진적 개선 가능

**단점**:
- ⚠️ 두 가지 레이아웃 방식 관리 필요
- ⚠️ 복잡도 증가

---

### 전략 C: 현재 방식 개선 (보수적)

**핵심 변경**:
1. 레이아웃 파라미터 동적 조정
2. 필터링 후 레이아웃 재계산
3. 충돌 해소 로직 강화

**장점**:
- ✅ 기존 구조 유지
- ✅ 점진적 개선

**단점**:
- ⚠️ Vis.js 기능 미활용
- ⚠️ 유지보수 부담 지속

---

## 🎯 우선순위별 개선 방안

### P0 (Critical): 즉시 적용 가능

1. **필터링 후 레이아웃 재계산**
   - 코드 위치: `frontend/graph.js:2427-2430`
   - 수정: `toggleFilter()`에서 `initPositions()` 호출 추가

2. **초기 뷰 제한 시 레이아웃 재계산**
   - 코드 위치: `frontend/graph.js:1473-1517`
   - 수정: 필터링된 노드만 레이아웃 계산

### P1 (High): 단기 개선

1. **Physics 조건부 활성화**
   - 코드 위치: `frontend/graph.js:1701`
   - 수정: 대용량 데이터에서만 Physics 활성화

2. **안정화 이벤트 리스너 추가**
   - 코드 위치: `frontend/graph.js:1397-1408`
   - 수정: `stabilizationIterationsDone` 이벤트 리스너 추가

### P2 (Medium): 중기 개선

1. **타 서비스 패턴 완전 적용**
   - Physics 기반 레이아웃으로 전환
   - 서버 레이아웃과 병행 사용

---

## 📊 코드 위치 매핑

### 타 서비스 → 현재 프로젝트 매핑

| 타 서비스 기능 | 타 서비스 코드 위치 | 현재 프로젝트 위치 | 상태 |
|--------------|-------------------|------------------|------|
| Physics 설정 | `getNetworkOptions()` | `renderGraphWithVisJs()` (1701) | ❌ 없음 |
| 안정화 리스너 | `setupStabilizationAndResize()` | `setupVisNetworkEvents()` (1397) | ❌ 없음 |
| 필터링 후 재빌드 | `buildGraph()` | `toggleFilter()` (2427) | ⚠️ 부분적 |
| 안정화 후 fit | `stabilizationIterationsDone` | 없음 | ❌ 없음 |
| Physics 재활성화 | `buildGraph()` | 없음 | ❌ 없음 |

---

## 🔗 관련 문서

- [밀집 그래프 검토](./CTO-DENSE-GRAPH-REVIEW.md)
- [마이그레이션 문서](./CTO-MIGRATION-VISJS-HTML.md)
- [캔버스 CSS 검토](./CTO-CANVAS-CSS-REVIEW.md)
