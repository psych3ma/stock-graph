# D3/SVG 기반 서비스 UX 패턴 분석 보고서

## 작성일
2026-02-17

## 검토자
UX 전문가 출신 CTO

## 목적
다른 서비스(D3/SVG 기반)의 UX 패턴을 분석하여, 현재 Vis.js 기반 시스템에 적용 가능한 인사이트 도출 (코드 수정 없이 원리 파악)

---

## 1. 노드가 뭉치지 않는 이유 분석

### 핵심 원리: Force-Directed Layout + 정밀한 좌표 계산

#### 1.1 정밀한 좌표 할당
```html
<g class="node company focused" transform="translate(515.5566720766554,228.29976745026724)">
<g class="node institution focused" transform="translate(601.7586889942432,337.1603467997526)">
<g class="node person dimmed" transform="translate(-130.57722608736086,694.9024866102211)">
```

**관찰**:
- 각 노드가 **소수점 10자리 이상의 정밀한 좌표**를 가짐
- 좌표 범위가 매우 넓음 (음수 포함: `-130.57...`, `-189.24...`)
- **완전히 랜덤하지 않고, 물리 시뮬레이션 결과**로 보임

**원리**:
1. **Force-Directed Algorithm**: D3.js의 `d3.forceSimulation()` 같은 물리 엔진 사용
   - **Repulsive Force**: 노드 간 반발력 (겹침 방지)
   - **Attractive Force**: 연결된 노드 간 인력 (관계 표현)
   - **Collision Detection**: 노드 크기 고려한 충돌 방지
   - **Center Gravity**: 중심으로 당기는 힘 (선택적)

2. **반복 계산 (Iteration)**:
   - 초기: 랜덤 배치 또는 원형 배치
   - 반복: 물리 힘 계산 → 위치 업데이트
   - 수렴: 에너지 최소화 지점에서 정지

3. **결과**: 각 노드가 **고유한 최적 위치**를 가짐

#### 1.2 현재 Vis.js 시스템과의 비교

**현재 시스템 (Vis.js)**:
- `physics: false` (서버 사이드 레이아웃 사용)
- PyGraphviz/NetworkX로 좌표 계산 후 고정
- **장점**: 결정론적, 성능 우수
- **단점**: 동적 물리 시뮬레이션 없음

**D3/SVG 시스템**:
- 클라이언트 사이드 force-directed layout
- 실시간 물리 시뮬레이션
- **장점**: 자연스러운 분산, 인터랙티브
- **단점**: 계산 비용, 비결정론적

**인사이트**: 
- Vis.js에서도 `physics: { enabled: true }`로 동적 레이아웃 가능
- 하지만 서버 사이드 레이아웃의 결정론적 특성 유지가 중요하므로, **초기 배치 최적화**가 핵심

---

## 2. "밤하늘의 별" 효과 구현 원리

### 핵심 원리: CSS 클래스 기반 상태 관리 + 시각적 계층 구조

#### 2.1 노드 상태 분류

**HTML 구조**:
```html
<g class="node company focused" ...>  <!-- 선택된 회사 노드 -->
<g class="node institution focused" ...>  <!-- 선택된 기관 노드 -->
<g class="node person dimmed" ...>  <!-- 비선택 개인 주주 -->
<g class="node company dimmed" ...>  <!-- 비선택 회사 -->
```

**상태 클래스**:
- `focused`: 선택된 노드 (밝게 빛남)
- `dimmed`: 비선택 노드 (어둡게)
- `node`: 기본 노드 클래스
- `company`, `person`, `major`, `institution`: 타입별 클래스

#### 2.2 시각적 효과 구현

**1. 노드 크기 차별화**:
```html
<circle r="28"></circle>  <!-- focused: 큰 크기 -->
<circle r="11"></circle>  <!-- dimmed: 작은 크기 -->
```
- Focused 노드: `r="26-28"` (큰 원)
- Dimmed 노드: `r="11-15"` (작은 원)
- **효과**: 선택된 노드가 "별처럼" 크게 빛남

**2. 텍스트 크기 차별화**:
```html
<text font-size="10.4">국민</text>  <!-- focused: 큰 폰트 -->
<text font-size="8">강상</text>  <!-- dimmed: 작은 폰트 -->
```
- Focused: `font-size="10.4-11.2"`
- Dimmed: `font-size="8"`
- **효과**: 선택된 노드의 라벨이 더 읽기 쉬움

**3. 엣지 하이라이트**:
```html
<line class="link highlighted" ...>  <!-- 연결된 엣지 -->
<line class="link" ...>  <!-- 일반 엣지 -->
```
- `highlighted` 클래스: 선택된 노드와 연결된 엣지만 강조
- **효과**: 네트워크 관계가 명확히 드러남

#### 2.3 "빛나는" 효과 구현 메커니즘

**CSS 기반 (추정)**:
```css
.node.focused {
  /* 밝은 색상, 두꺼운 테두리 */
  stroke: var(--accent);  /* 오렌지 */
  stroke-width: 3;
  filter: drop-shadow(0 0 8px rgba(255, 100, 0, 0.6));  /* 글로우 효과 */
}

.node.dimmed {
  /* 어두운 색상, 얇은 테두리 */
  stroke: rgba(255, 100, 0, 0.3);
  stroke-width: 1;
  opacity: 0.5;  /* 반투명 */
}
```

**JavaScript 기반 상태 전환**:
1. 노드 클릭 시:
   - 클릭된 노드: `dimmed` → `focused`
   - 다른 모든 노드: `focused` → `dimmed`
   - 연결된 엣지: `link` → `link highlighted`

2. 애니메이션:
   - CSS `transition`으로 부드러운 전환
   - `opacity`, `stroke-width`, `font-size` 변화

---

## 3. "더 자세히 보여주는" 효과 구현 원리

### 핵심 원리: Tooltip + 네트워크 하이라이트

#### 3.1 Tooltip 표시

**HTML 구조**:
```html
<div id="tooltip" style="left: 190px; top: 444px;" class="">
  <div class="tt-name">국민연금</div>
  <div class="tt-type" style="color:#6366f1">기관</div>
</div>
```

**동작 원리**:
1. 노드 클릭/호버 시 JavaScript로 `tooltip` 위치 계산
2. `left`, `top` 스타일 동적 설정
3. 노드 정보(`tt-name`, `tt-type`) 동적 업데이트
4. CSS로 포지셔닝 (`position: absolute`)

#### 3.2 네트워크 하이라이트

**엣지 하이라이트**:
```html
<line class="link highlighted" ...>  <!-- 선택된 노드와 연결 -->
<line class="link" ...>  <!-- 일반 엣지 -->
```

**동작 원리**:
1. 선택된 노드의 ID 추출
2. 해당 노드와 연결된 모든 엣지 찾기
3. 연결된 엣지에 `highlighted` 클래스 추가
4. CSS로 색상/두께 변경

**노드 하이라이트**:
- 선택된 노드: `focused` 클래스
- 연결된 노드: `highlighted` 또는 `focused` 클래스 (선택적)
- 나머지 노드: `dimmed` 클래스

---

## 4. Vis.js로 동일 효과 구현 가능성 분석

### 4.1 현재 Vis.js 시스템

**장점**:
- 이미 `physics: false`로 서버 사이드 레이아웃 사용
- `highlight` 옵션으로 노드 강조 가능
- `selectNodes()` API로 노드 선택 가능

**부족한 부분**:
- `focused`/`dimmed` 같은 **시각적 계층 구조** 없음
- 선택 시 **다른 노드 dimming** 효과 없음
- 엣지 하이라이트가 **자동으로 연결된 엣지만** 강조하지 않음

### 4.2 구현 가능한 패턴

#### 패턴 1: 노드 크기/투명도 차별화
```javascript
// Vis.js options
nodes: {
  size: (node) => {
    return node.selected ? 30 : 15;  // 선택 시 크게
  },
  opacity: (node) => {
    return node.selected ? 1.0 : 0.4;  // 비선택 시 반투명
  },
}
```

#### 패턴 2: 엣지 하이라이트
```javascript
// 노드 선택 시
visNetwork.on('click', (params) => {
  if (params.nodes.length > 0) {
    const selectedId = params.nodes[0];
    // 연결된 엣지만 하이라이트
    const connectedEdges = visNetwork.getConnectedEdges(selectedId);
    visNetwork.setOptions({
      edges: {
        color: {
          color: (edge) => {
            return connectedEdges.includes(edge.id) ? '#d85604' : '#8b7d6f';
          }
        }
      }
    });
  }
});
```

#### 패턴 3: 네트워크 중심 뷰
```javascript
// 선택된 노드와 연결된 노드만 강조
visNetwork.on('click', (params) => {
  if (params.nodes.length > 0) {
    const selectedId = params.nodes[0];
    const connectedNodes = visNetwork.getConnectedNodes(selectedId);
    
    // 선택된 노드 + 연결된 노드만 표시 (나머지 숨김)
    // 또는 투명도 조절
    visNetwork.setData({
      nodes: nodes.map(n => ({
        ...n,
        opacity: (n.id === selectedId || connectedNodes.includes(n.id)) ? 1.0 : 0.2
      })),
      edges: edges
    });
  }
});
```

---

## 5. UX 패턴 요약 및 권장사항

### 5.1 핵심 UX 패턴

| 패턴 | 구현 원리 | Vis.js 적용 가능성 |
|------|----------|-------------------|
| **노드 분산** | Force-directed layout + 정밀 좌표 | ✅ 서버 사이드 레이아웃으로 대체 가능 |
| **별처럼 빛남** | `focused`/`dimmed` 클래스 + 크기/투명도 | ✅ Vis.js `highlight` + 커스텀 옵션 |
| **네트워크 하이라이트** | 연결된 엣지만 `highlighted` 클래스 | ✅ `getConnectedEdges()` API 활용 |
| **상세 정보 표시** | Tooltip + 동적 포지셔닝 | ✅ 이미 구현됨 (`hoverNode` 이벤트) |

### 5.2 권장 개선 사항 (Vis.js 기반)

#### 즉시 적용 가능 (P0)
1. **노드 선택 시 dimming 효과**:
   - 선택된 노드: `opacity: 1.0`, `size: 원래 크기`
   - 비선택 노드: `opacity: 0.3-0.4`, `size: 작게`
   - 연결된 노드: `opacity: 0.7-0.8` (중간 단계)

2. **엣지 하이라이트**:
   - 선택된 노드와 연결된 엣지만 강조 색상
   - 나머지 엣지는 연한 회색

3. **노드 크기 차별화**:
   - 선택된 노드: 원래 크기 유지 또는 약간 확대
   - 비선택 노드: 약간 축소 (80-90%)

#### 중기 개선 (P1)
4. **애니메이션 전환**:
   - `animation: { duration: 300 }`로 부드러운 전환
   - `easingFunction: 'easeInOutQuad'`

5. **네트워크 중심 뷰**:
   - 선택 시 연결된 노드로 자동 줌/패닝
   - `focus()` API 활용

---

## 6. 기술적 구현 원리 요약

### 6.1 노드가 뭉치지 않는 이유

**D3/SVG 시스템**:
1. **Force-Directed Layout**: 물리 시뮬레이션으로 노드 간 반발력 계산
2. **정밀 좌표**: 각 노드에 고유한 소수점 좌표 할당
3. **충돌 감지**: 노드 크기 고려한 최소 거리 유지
4. **반복 계산**: 에너지 최소화까지 반복

**현재 Vis.js 시스템**:
- 서버 사이드 레이아웃(PyGraphviz/NetworkX)으로 동일 효과 달성
- 결정론적 레이아웃 (같은 데이터 → 같은 배치)
- 클라이언트 물리 엔진 불필요

### 6.2 "별처럼 빛나는" 효과

**구현 메커니즘**:
1. **CSS 클래스 기반 상태 관리**: `focused` vs `dimmed`
2. **시각적 차별화**:
   - 크기: `r="28"` vs `r="11"`
   - 폰트: `font-size="10.4"` vs `font-size="8"`
   - 투명도: `opacity: 1.0` vs `opacity: 0.5`
   - 테두리: `stroke-width: 3` vs `stroke-width: 1`
3. **애니메이션**: CSS `transition`으로 부드러운 전환

**Vis.js 적용**:
- `nodes.opacity` 옵션으로 동일 효과 가능
- `nodes.size` 옵션으로 크기 차별화 가능
- `highlight` 이벤트로 상태 전환 가능

### 6.3 "더 자세히 보여주는" 효과

**구현 메커니즘**:
1. **Tooltip**: 동적 포지셔닝 + 노드 정보 표시
2. **엣지 하이라이트**: 연결된 엣지만 `highlighted` 클래스
3. **네트워크 중심 뷰**: 선택된 노드와 연결된 노드만 강조

**Vis.js 적용**:
- `hoverNode` 이벤트로 tooltip 표시 (이미 구현됨)
- `getConnectedEdges()` API로 연결된 엣지 찾기
- `setOptions()`로 엣지 색상 동적 변경

---

## 7. 결론 및 다음 단계

### 핵심 인사이트

1. **노드 분산**: Force-directed layout의 핵심은 **반발력 + 정밀 좌표**. 현재 시스템은 서버 사이드 레이아웃으로 동일 효과 달성 가능.

2. **별처럼 빛남**: **시각적 계층 구조**(focused/dimmed)가 핵심. Vis.js의 `opacity`, `size`, `highlight` 옵션으로 구현 가능.

3. **네트워크 하이라이트**: **연결된 엣지만 강조**하는 것이 UX 핵심. Vis.js `getConnectedEdges()` API 활용.

### 권장 적용 순서

1. **P0**: 노드 선택 시 dimming 효과 (opacity 조절)
2. **P0**: 연결된 엣지만 하이라이트
3. **P1**: 노드 크기 차별화 (선택 시 확대)
4. **P1**: 애니메이션 전환 효과

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-02-17
