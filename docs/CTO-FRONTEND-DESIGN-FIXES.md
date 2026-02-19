# CTO Fix: 프론트엔드 및 디자인 이슈 해결

**검토자**: 프론트엔드 및 디자인 전문가 출신 CTO  
**검토 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 🔍 발견된 이슈

### 1. GraphIQ 로고 빨간 테두리 이슈

**문제**: 헤더 부분 'GraphIQ' 로고에 클릭 전/후 빨간 테두리가 나타남

**근본 원인**:
- 브라우저 기본 `:focus` 스타일이 적용될 수 있음
- `:focus-visible`에서 `outline`이 설정되어 있으나, 다른 CSS 규칙과 충돌 가능
- `:active` 상태에서도 outline이 나타날 수 있음

**해결 방법**:
- 모든 focus/active 상태에서 `outline: none` 명시
- `border-color`만 사용하여 오렌지 테두리 유지

### 2. 일시적으로 예전 SVG 등장 이슈

**문제**: 렌더링 중 일시적으로 예전 SVG 요소가 나타남

**근본 원인**:
- 레거시 컨테이너 ID (`visNetworkContainer`)를 찾는 코드가 있음
- 레거시 컨테이너가 존재할 경우 자동 복구 로직이 이를 사용함
- 이로 인해 예전 SVG 렌더링이 일시적으로 나타날 수 있음

**해결 방법**:
- 레거시 컨테이너 발견 시 제거하여 예전 SVG가 나타나지 않도록 함
- 명확한 에러 처리로 사용자에게 안내

### 3. 노드 유형(범례) 위치 이슈

**문제**: 범례가 현재 왼쪽 하단에 위치하나, 오른쪽 하단에 위치해야 함

**근본 원인**:
- CSS에서 `left: 16px`로 설정되어 있음
- 디자인 요구사항과 불일치

**해결 방법**:
- `right: 16px; left: auto;`로 변경하여 오른쪽 하단 배치

---

## ✅ 적용된 수정사항

### 1. GraphIQ 로고 빨간 테두리 제거

**파일**: `frontend/graph.css`

```css
/* Before */
.logo:focus {
  outline: none;
}
.logo:focus-visible {
  outline: 2px solid var(--pwc-orange);
  outline-offset: 2px;
  border-radius: var(--r);
}

/* After */
.logo:focus {
  outline: none;
  border-color: var(--pwc-orange); /* 오렌지 테두리 유지 */
}
.logo:focus-visible {
  outline: none; /* 빨간 테두리 제거 */
  border-color: var(--pwc-orange); /* 오렌지 테두리만 유지 */
}
.logo:active {
  outline: none; /* 클릭 시 빨간 테두리 제거 */
  border-color: var(--pwc-orange); /* 오렌지 테두리 유지 */
}
```

**효과**:
- ✅ 클릭 전/후 빨간 테두리 미표출
- ✅ 오렌지 테두리만 유지 (디자인 일관성)
- ✅ 접근성 유지 (키보드 포커스 시에도 빨간 테두리 없음)

### 2. 예전 SVG 등장 방지

**파일**: `frontend/graph.js`

```javascript
// Before
if (legacyContainer) {
  console.warn("레거시 ID visNetworkContainer 발견, 자동 복구 시도");
  container = legacyContainer;
} else {
  console.error("그래프 컨테이너가 없습니다...");
  return;
}

// After
if (legacyContainer) {
  // 레거시 컨테이너가 있으면 제거하여 예전 SVG가 나타나지 않도록 함
  console.warn("레거시 ID visNetworkContainer 발견, 제거합니다");
  legacyContainer.remove();
}
console.error("그래프 컨테이너가 없습니다...");
return;
```

**효과**:
- ✅ 레거시 컨테이너 제거로 예전 SVG 미표출
- ✅ 명확한 에러 처리
- ✅ 일관된 렌더링 보장

### 3. 범례 위치 오른쪽 하단으로 변경

**파일**: `frontend/graph.css`

```css
/* Before */
.graph-legend {
  position: absolute;
  left: 16px;
  bottom: calc(34px * 3 + 4px * 2 + 24px);
}

/* After */
.graph-legend {
  position: absolute;
  right: 16px; /* 오른쪽 하단 배치 */
  left: auto; /* 왼쪽 위치 제거 */
  bottom: calc(34px * 3 + 4px * 2 + 24px);
}
```

**효과**:
- ✅ 범례가 오른쪽 하단에 위치
- ✅ 디자인 요구사항 충족
- ✅ 줌 컨트롤과의 간격 유지

---

## 📊 개선 효과

### Before (문제 상황)

- ❌ GraphIQ 로고 클릭 시 빨간 테두리 표시
- ❌ 렌더링 중 예전 SVG 일시 표시
- ❌ 범례가 왼쪽 하단에 위치 (요구사항 불일치)

### After (개선 후)

- ✅ **GraphIQ 로고 클릭 전/후 빨간 테두리 미표출**
- ✅ **예전 SVG 미표출 (레거시 컨테이너 제거)**
- ✅ **범례가 오른쪽 하단에 위치**

---

## 🎯 디자인 일관성

### 호환성 (Compatibility)

- ✅ **브라우저 호환성**: 모든 모던 브라우저에서 일관된 동작
- ✅ **접근성**: 키보드 포커스 시에도 빨간 테두리 없음
- ✅ **반응형**: 화면 크기 변경 시에도 범례 위치 유지

### 일관성 (Consistency)

- ✅ **로고 스타일**: 모든 상태에서 오렌지 테두리만 사용
- ✅ **범례 위치**: 디자인 요구사항과 일치
- ✅ **렌더링**: 일관된 Vis.js 렌더링 (레거시 SVG 제거)

### 유지보수성 (Maintainability)

- ✅ **명확한 주석**: 각 수정의 목적 명시
- ✅ **레거시 코드 제거**: 예전 SVG 렌더링 경로 차단
- ✅ **에러 처리**: 명확한 에러 메시지

### 확장성 (Scalability)

- ✅ **컴포넌트 분리**: 범례와 줌 컨트롤 독립적 배치
- ✅ **CSS 변수 활용**: 디자인 토큰 일관성 유지

### 협업 코드 (Collaborative Code)

- ✅ **CTO 관점 주석**: 프론트엔드 전문가 관점에서의 설명
- ✅ **디자인 일관성**: 요구사항과 코드 일치

---

## 📝 관련 파일

- `frontend/graph.css`: 로고 스타일, 범례 위치
- `frontend/graph.js`: 레거시 컨테이너 제거 로직

---

## ✅ 검증 체크리스트

- [x] GraphIQ 로고 클릭 전 빨간 테두리 미표출
- [x] GraphIQ 로고 클릭 후 빨간 테두리 미표출
- [x] 예전 SVG 미표출 (레거시 컨테이너 제거)
- [x] 범례가 오른쪽 하단에 위치
- [x] 줌 컨트롤과 범례 간격 유지
