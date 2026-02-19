# 프론트엔드 마이그레이션 QA 리포트

**검토 일자**: 2026-02-19  
**검토 범위**: HTML, JavaScript, CSS 간 ID/클래스명 일관성  
**심각도**: 🔴 **CRITICAL** - 런타임 에러 발생 가능

---

## 🔴 CRITICAL 이슈: HTML-JavaScript ID 불일치

### 발견된 불일치 항목

| 요소 | HTML (현재) | JavaScript (기대) | CSS (기대) | 상태 |
|------|-------------|-------------------|------------|------|
| 그래프 컨테이너 | `visNetworkContainer` | `visNetwork` | `#visNetwork` | ❌ 불일치 |
| 툴팁 | `tooltip` | `graphTooltip` | `#graphTooltip` | ❌ 불일치 |
| 로딩 오버레이 | `graphLoadingOverlay` | `loadingOverlay` | `.loading-overlay` | ❌ 불일치 |
| 로딩 텍스트 | `graphLoadingStep` | `loadingText` | `.loading-text` | ❌ 불일치 |
| 로딩 힌트 | `graphLoadingHint` | `loadingGuidance` | `.loading-guidance` | ❌ 불일치 |

---

## 📋 상세 분석

### 1. 그래프 컨테이너 ID 불일치

**HTML (graph.html:92)**:
```html
<div id="visNetworkContainer"></div>
```

**JavaScript (graph.js:1413)**:
```javascript
let container = document.getElementById('visNetwork');
```

**영향**:
- ❌ `renderGraphWithVisJs()` 함수에서 컨테이너를 찾지 못함
- ❌ 레거시 ID 자동 복구 로직이 작동하지만, 일관성 부족
- ⚠️ 런타임 경고 발생 가능

**해결책**: HTML의 `id="visNetworkContainer"`를 `id="visNetwork"`로 변경

---

### 2. 툴팁 ID 불일치

**HTML (graph.html:94)**:
```html
<div class="node-tooltip" id="tooltip"></div>
```

**JavaScript (graph.js:906)**:
```javascript
const tooltip = document.getElementById('graphTooltip');
```

**영향**:
- ❌ `showTooltip()`, `hideTooltip()` 함수에서 툴팁을 찾지 못함
- ❌ 노드 호버 시 툴팁이 표시되지 않음
- 🔴 **사용자 경험 저하**

**해결책**: HTML의 `id="tooltip"`을 `id="graphTooltip"`으로 변경

---

### 3. 로딩 오버레이 ID 불일치

**HTML (graph.html:86)**:
```html
<div class="graph-loading-overlay hidden" id="graphLoadingOverlay">
```

**JavaScript (graph.js:782, 793, 827, 884)**:
```javascript
const overlay = document.getElementById('loadingOverlay'); // 새로운
const overlay = document.getElementById('graphLoadingOverlay'); // 레거시 (일부 함수)
```

**영향**:
- ⚠️ 일부 함수는 레거시 ID를 사용하지만, 새로운 함수는 `loadingOverlay`를 찾음
- ❌ 새로운 로딩 오버레이 기능이 작동하지 않음
- ⚠️ 로딩 상태 표시 불일치

**해결책**: HTML을 새로운 구조로 업데이트 필요

---

### 4. 로딩 텍스트/힌트 ID 불일치

**HTML (graph.html:88-89)**:
```html
<div class="graph-loading-step" id="graphLoadingStep">데이터 로딩 중...</div>
<div class="graph-loading-hint" id="graphLoadingHint">잠시만 기다려 주세요</div>
```

**JavaScript (graph.js:827-884)**:
```javascript
// 새로운 구조 사용 (loadingText, loadingGuidance)
```

**영향**:
- ❌ 새로운 로딩 메시지 업데이트 기능이 작동하지 않음
- ⚠️ 프로그레스바 및 단계 인디케이터 미작동

**해결책**: HTML을 새로운 로딩 오버레이 구조로 완전히 교체 필요

---

## 🔍 추가 발견 사항

### 1. CSS 클래스명 불일치

**HTML 사용**:
- `graph-loading-overlay` (레거시)
- `node-tooltip` (레거시)

**CSS 정의**:
- `.loading-overlay` (새로운)
- `#graphTooltip` (새로운)

**영향**: 스타일이 적용되지 않을 수 있음

---

### 2. JavaScript 레거시 지원

**자동 복구 로직 존재** (graph.js:1418-1440):
```javascript
const legacyContainer = document.getElementById('visNetworkContainer');
if (legacyContainer) {
  console.warn('레거시 ID visNetworkContainer 발견, 자동 복구 시도');
  // ...
}
```

**평가**:
- ✅ 일시적으로 작동하지만, 일관성 부족
- ⚠️ 경고 메시지가 콘솔에 출력됨
- ❌ 장기적으로는 HTML 업데이트 필요

---

## 📊 전후 비교 분석

### Before (이상적인 마이그레이션 후 상태)

**HTML**:
```html
<div id="visNetwork"></div>
<div id="graphTooltip"></div>
<div class="loading-overlay" id="loadingOverlay">
  <div class="loading-text" id="loadingText"></div>
  <div class="loading-guidance" id="loadingGuidance"></div>
</div>
```

**JavaScript**:
```javascript
const container = document.getElementById('visNetwork'); // ✅
const tooltip = document.getElementById('graphTooltip'); // ✅
const overlay = document.getElementById('loadingOverlay'); // ✅
```

**CSS**:
```css
#visNetwork { ... } /* ✅ */
#graphTooltip { ... } /* ✅ */
.loading-overlay { ... } /* ✅ */
```

---

### After (현재 상태)

**HTML**:
```html
<div id="visNetworkContainer"></div> <!-- ❌ -->
<div id="tooltip"></div> <!-- ❌ -->
<div id="graphLoadingOverlay"> <!-- ❌ -->
  <div id="graphLoadingStep"></div> <!-- ❌ -->
  <div id="graphLoadingHint"></div> <!-- ❌ -->
</div>
```

**JavaScript**:
```javascript
const container = document.getElementById('visNetwork'); // ❌ 찾지 못함
const tooltip = document.getElementById('graphTooltip'); // ❌ 찾지 못함
const overlay = document.getElementById('loadingOverlay'); // ❌ 찾지 못함
```

**결과**:
- 🔴 그래프 렌더링 실패 가능성
- 🔴 툴팁 미작동
- 🔴 로딩 오버레이 미작동

---

## 🛠️ 수정 방안

### 즉시 수정 필요 (P0)

1. **HTML ID 업데이트**:
   - `visNetworkContainer` → `visNetwork`
   - `tooltip` → `graphTooltip`
   - `graphLoadingOverlay` → `loadingOverlay`

2. **HTML 구조 업데이트**:
   - 레거시 로딩 오버레이를 새로운 구조로 교체
   - 새로운 클래스명 적용 (`loading-overlay`, `loading-text`, `loading-guidance`)

3. **CSS 클래스명 정리**:
   - 레거시 CSS 주석 처리 또는 제거
   - 새로운 CSS 구조 확인

---

## ✅ 검증 체크리스트

### HTML 검증
- [ ] `id="visNetwork"` 존재 확인
- [ ] `id="graphTooltip"` 존재 확인
- [ ] `id="loadingOverlay"` 존재 확인
- [ ] 새로운 로딩 오버레이 구조 확인
- [ ] 레거시 ID 제거 확인

### JavaScript 검증
- [ ] `getElementById('visNetwork')` 성공 확인
- [ ] `getElementById('graphTooltip')` 성공 확인
- [ ] `getElementById('loadingOverlay')` 성공 확인
- [ ] 레거시 자동 복구 로직 제거 가능 여부 확인

### CSS 검증
- [ ] `#visNetwork` 스타일 적용 확인
- [ ] `#graphTooltip` 스타일 적용 확인
- [ ] `.loading-overlay` 스타일 적용 확인
- [ ] 레거시 CSS 제거 확인

### 기능 검증
- [ ] 그래프 렌더링 정상 작동
- [ ] 노드 호버 시 툴팁 표시
- [ ] 로딩 오버레이 표시/숨김
- [ ] 로딩 프로그레스바 작동
- [ ] 로딩 단계 인디케이터 작동

---

## 📌 우선순위

### P0 (즉시 수정)
1. ✅ HTML ID 업데이트 (`visNetwork`, `graphTooltip`, `loadingOverlay`)
2. ✅ HTML 로딩 오버레이 구조 업데이트

### P1 (이번 주)
1. ⚠️ 레거시 자동 복구 로직 제거 (HTML 수정 후)
2. ⚠️ 레거시 CSS 정리

### P2 (이번 달)
1. ⚠️ 전체 마이그레이션 문서 업데이트
2. ⚠️ 테스트 케이스 추가

---

## 🔗 관련 문서

- [마이그레이션 문서](./CTO-MIGRATION-VISJS-HTML.md)
- [디버깅 문서](./CTO-DEBUG-VISNETWORK-ERROR.md)
- [캔버스 CSS 검토](./CTO-CANVAS-CSS-REVIEW.md)
