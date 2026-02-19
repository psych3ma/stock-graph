# QA: 레거시 컨테이너(visNetworkContainer) 영향도 분석

**검토자**: CTO 전문가  
**검토 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 요약

**레거시 ID**: `visNetworkContainer`  
**현재 ID**: `visNetwork`  
**상태**: 레거시 ID가 여러 위치에서 참조되고 있으나, 현재는 자동 복구/제거 로직으로 처리됨

---

## 🔍 영향도 있는 위치 리스트업

### 1. JavaScript 파일

#### `frontend/graph.js`

**위치 1**: `loadGraph()` 함수 (라인 ~491)
```javascript
const legacyContainer = document.getElementById("visNetworkContainer");
```
- **용도**: 초기화 시점에 레거시 컨테이너 확인
- **영향도**: 🟡 **MEDIUM**
- **현재 동작**: 레거시 컨테이너 발견 시 제거 (`legacyContainer.remove()`)
- **의존성**: 없음 (단순 확인 및 제거)

**위치 2**: `renderGraphWithVisJs()` 함수 (라인 ~1643)
```javascript
const legacyContainer = document.getElementById("visNetworkContainer");
```
- **용도**: 렌더링 시점에 레거시 컨테이너 확인
- **영향도**: 🟡 **MEDIUM**
- **현재 동작**: 레거시 컨테이너 발견 시 제거 (`legacyContainer.remove()`)
- **의존성**: 없음 (단순 확인 및 제거)

**참조 위치 상세**:
- 라인 491: `loadGraph()` 내부 - 초기화 체크
- 라인 495: 디버깅 정보에 포함
- 라인 507-509: 레거시 컨테이너 제거 로직
- 라인 1636: 주석 (ID 변경 기록)
- 라인 1643: `renderGraphWithVisJs()` 내부 - 렌더링 체크
- 라인 1654: 디버깅 정보에 포함
- 라인 1677-1680: 레거시 컨테이너 제거 로직

---

### 2. CSS 파일

#### `frontend/graph.css`

**위치**: 레거시 CSS 주석 처리 (라인 ~471-511)
```css
/*
#visNetworkContainer{
  position:absolute;
  top:0;
  left:0;
  width:100%;
  height:100%;
  display:block;
}
...
*/
```
- **용도**: 참고용으로 주석 처리됨
- **영향도**: 🟢 **LOW** (주석 처리되어 있음)
- **현재 동작**: CSS 적용 안 됨
- **의존성**: 없음

**참조 위치 상세**:
- 라인 466-511: 레거시 CSS 주석 블록
- 라인 475: 주석 내부 설명
- 라인 523: 주석 (ID 변경 기록)

---

### 3. HTML 파일

#### `frontend/graph.html`

**위치**: 주석 (라인 ~127)
```html
<!-- CTO: ID 변경 (visNetworkContainer → visNetwork) -->
```
- **용도**: 변경 기록 주석
- **영향도**: 🟢 **LOW** (주석만 존재)
- **현재 동작**: 영향 없음
- **의존성**: 없음

**참조 위치 상세**:
- 라인 127: 주석 (ID 변경 기록)
- 실제 HTML 요소는 `id="visNetwork"`로 정상 사용 중

---

### 4. 문서 파일

#### `docs/` 디렉토리 내 여러 파일

**파일 목록**:
1. `docs/CTO-DEBUG-VISNETWORK-ERROR.md`
2. `docs/CTO-FRONTEND-DESIGN-FIXES.md`
3. `docs/CTO-MIGRATION-VISJS-HTML.md`
4. `docs/QA-FRONTEND-MIGRATION-FIXED.md`
5. `docs/QA-FRONTEND-MIGRATION-ISSUES.md`
6. `docs/VISJS-SINGLE-MIGRATION.md`
7. `docs/NODE-OVERLAP-FIX.md`

- **용도**: 문서화 및 기록
- **영향도**: 🟢 **LOW** (문서만 존재)
- **현재 동작**: 영향 없음
- **의존성**: 없음

---

## 📊 영향도 분석

### 🟢 LOW 영향도 (안전)

**항목**:
- CSS 주석 처리된 레거시 스타일
- HTML 주석
- 문서 파일 내 참조

**이유**:
- 실행 코드에 영향 없음
- 주석 처리되어 있거나 문서만 존재

**조치 필요성**: ❌ 없음 (정리 가능하나 우선순위 낮음)

---

### 🟡 MEDIUM 영향도 (주의 필요)

**항목**:
- `frontend/graph.js` 내 `getElementById("visNetworkContainer")` 호출 (2곳)

**이유**:
- 현재는 자동 복구/제거 로직으로 처리됨
- 레거시 컨테이너가 존재할 경우 제거하므로 안전
- 하지만 불필요한 코드 존재

**현재 동작**:
```javascript
// 위치 1: loadGraph()
if (legacyContainer) {
  console.warn("레거시 ID visNetworkContainer 발견, 제거합니다");
  legacyContainer.remove();
}

// 위치 2: renderGraphWithVisJs()
if (legacyContainer) {
  console.warn("레거시 ID visNetworkContainer 발견, 제거합니다");
  legacyContainer.remove();
}
```

**조치 필요성**: ⚠️ **검토 필요**
- 레거시 컨테이너가 실제로 존재하지 않는다면 제거 가능
- 하지만 안전장치로 유지하는 것도 고려 가능

---

### 🔴 HIGH 영향도

**항목**: 없음

**이유**:
- 레거시 컨테이너가 실제 HTML에 존재하지 않음
- 모든 참조는 확인/제거 로직으로만 사용됨

---

## 🎯 권장 조치사항

### 즉시 조치 (P0)

**없음** - 현재 상태는 안전함

---

### 단기 조치 (P1)

#### 1. JavaScript 레거시 참조 정리

**옵션 A: 완전 제거** (권장)
- 레거시 컨테이너가 실제로 존재하지 않는다면 확인 로직 제거
- 코드 간소화 및 유지보수성 향상

**옵션 B: 유지** (안전장치)
- 레거시 컨테이너가 예상치 못하게 나타날 경우를 대비
- 현재 로직 유지 (제거만 수행)

**권장**: **옵션 A (완전 제거)**
- 이유: HTML에 레거시 컨테이너가 없으므로 불필요한 코드
- 영향도: 🟡 MEDIUM → 🟢 LOW

**수정 위치**:
- `frontend/graph.js` 라인 ~491-509 (loadGraph 내부)
- `frontend/graph.js` 라인 ~1643-1680 (renderGraphWithVisJs 내부)

---

#### 2. CSS 레거시 주석 정리

**옵션**: 주석 처리된 레거시 CSS 제거
- 영향도: 🟢 LOW
- 우선순위: 낮음 (정리 목적)

**수정 위치**:
- `frontend/graph.css` 라인 ~466-511

---

### 장기 조치 (P2)

#### 문서 정리

**옵션**: 문서 파일 내 레거시 참조 정리 또는 업데이트
- 영향도: 🟢 LOW
- 우선순위: 매우 낮음

---

## 📝 수정 시 주의사항

### 1. JavaScript 수정 시

**체크리스트**:
- [ ] `getElementById("visNetworkContainer")` 호출 제거
- [ ] 관련 디버깅 정보에서 `legacyIdFound` 제거
- [ ] 레거시 컨테이너 제거 로직 제거
- [ ] `getElementById("visNetwork")` 호출이 정상 작동하는지 확인

**테스트 항목**:
- [ ] 그래프 초기화 정상 작동
- [ ] 그래프 렌더링 정상 작동
- [ ] 에러 처리 정상 작동 (컨테이너 없을 경우)

---

### 2. CSS 수정 시

**체크리스트**:
- [ ] 주석 처리된 레거시 CSS 제거
- [ ] 새로운 CSS (`#visNetwork`) 정상 작동 확인

**테스트 항목**:
- [ ] 그래프 컨테이너 스타일 정상 적용

---

## 🔄 수정 전후 비교

### Before (현재 상태)

**JavaScript**:
```javascript
// loadGraph()
const legacyContainer = document.getElementById("visNetworkContainer");
if (legacyContainer) {
  console.warn("레거시 ID visNetworkContainer 발견, 제거합니다");
  legacyContainer.remove();
}

// renderGraphWithVisJs()
const legacyContainer = document.getElementById("visNetworkContainer");
if (legacyContainer) {
  console.warn("레거시 ID visNetworkContainer 발견, 제거합니다");
  legacyContainer.remove();
}
```

**CSS**:
```css
/*
#visNetworkContainer{
  ...
}
*/
```

---

### After (권장 수정 후)

**JavaScript**:
```javascript
// loadGraph()
// 레거시 컨테이너 확인 로직 제거 (불필요)

// renderGraphWithVisJs()
let container = document.getElementById("visNetwork");
if (!container) {
  console.error("그래프 컨테이너를 찾을 수 없습니다...");
  return;
}
```

**CSS**:
```css
/* 레거시 CSS 주석 제거 */
#visNetwork {
  width: 100%;
  height: 100%;
  ...
}
```

---

## ✅ 검증 체크리스트

### 수정 전 검증

- [x] 레거시 컨테이너가 HTML에 존재하지 않음 확인
- [x] 현재 코드가 정상 작동함 확인
- [x] 영향도 분석 완료

### 수정 후 검증

- [ ] 그래프 초기화 정상 작동
- [ ] 그래프 렌더링 정상 작동
- [ ] 에러 처리 정상 작동
- [ ] 브라우저 콘솔에 경고 없음

---

## 📚 관련 파일

### 수정 대상 파일

1. `frontend/graph.js` (2곳)
   - 라인 ~491-509: `loadGraph()` 내부
   - 라인 ~1643-1680: `renderGraphWithVisJs()` 내부

2. `frontend/graph.css` (선택사항)
   - 라인 ~466-511: 레거시 CSS 주석

### 참고 문서

- `docs/QA-FRONTEND-MIGRATION-ISSUES.md`
- `docs/QA-FRONTEND-MIGRATION-FIXED.md`
- `docs/CTO-DEBUG-VISNETWORK-ERROR.md`

---

## 🎯 결론

**현재 상태**: 🟢 **안전** - 레거시 컨테이너 참조는 있으나 안전장치로만 작동

**권장 조치**: 🟡 **정리 권장** - 불필요한 코드 제거로 유지보수성 향상

**우선순위**: P1 (단기 조치) - 기능에는 영향 없으나 코드 정리 목적
