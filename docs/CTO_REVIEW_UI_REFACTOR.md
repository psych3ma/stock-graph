# CTO 관점 검토: UI 리팩토링 (필터 개수 이동 및 영어 표현 제거)

**검토 일자**: 2026-02-17  
**요청 사항**: 
1. 필터에서 개수 제거
2. 노드 유형 섹션에 개수 추가
3. 노드 유형에서 영어 표현 제거

---

## 📋 변경 사항 요약

### 1. 필터 UI 단순화
**변경 전**:
```html
<div class="filter-pill">
  <div class="filter-dot"></div>
  <span class="filter-label">회사</span>
  <span class="filter-count">212</span>  <!-- 제거됨 -->
</div>
```

**변경 후**:
```html
<div class="filter-pill">
  <div class="filter-dot"></div>
  <span class="filter-label">회사</span>
</div>
```

**효과**:
- ✅ UI 단순화: 필터는 토글 기능에만 집중
- ✅ 시각적 정리: 불필요한 정보 제거로 클릭 영역 명확화
- ✅ 성능: 필터 렌더링 시 개수 업데이트 로직 제거 (미미한 개선)

### 2. 노드 유형 섹션에 개수 추가
**변경 전**:
```html
<div class="legend-row">
  <div class="lc"></div>회사 (Company)
</div>
```

**변경 후**:
```html
<div class="legend-row">
  <div class="lc"></div>
  <span class="legend-label">회사</span>
  <span class="legend-count" data-count-type="company">(212)</span>
</div>
```

**효과**:
- ✅ 정보 제공: 사용자가 각 노드 타입의 총 개수를 한눈에 확인 가능
- ✅ UX 개선: 필터와 정보 표시의 역할 분리 (필터=제어, 유형=정보)
- ✅ 일관성: 개수를 괄호로 표시하여 레이블과 구분

### 3. 영어 표현 제거
**변경 전**:
- 회사 (Company)
- 개인주주 (Person)
- 최대주주 (Major)
- 기관 (Institution)

**변경 후**:
- 회사
- 개인주주
- 최대주주
- 기관

**효과**:
- ✅ 로컬라이제이션: 한국어만 사용하여 일관성 확보
- ✅ UI 간소화: 불필요한 중복 정보 제거
- ✅ 접근성: 한국 사용자에게 더 직관적인 인터페이스

---

## 🔧 기술적 변경 사항

### HTML 구조 변경

**필터 섹션** (`frontend/graph.html:503-518`):
- `filter-count` span 요소 제거
- 필터는 순수 토글 기능만 수행

**노드 유형 섹션** (`frontend/graph.html:559-576`):
- 구조화된 HTML: `legend-label`과 `legend-count` 분리
- `data-count-type` 속성으로 동적 업데이트 지원

### CSS 스타일 추가

```css
.legend-label { flex: 1; }
.legend-count {
  font-size: 10px;
  color: var(--text-3);
  font-weight: 500;
  margin-left: auto;  /* 오른쪽 정렬 */
}
```

**설계 의도**:
- `flex: 1`로 레이블이 공간을 차지하고, 개수는 오른쪽에 정렬
- 작은 폰트와 회색으로 정보의 중요도 표현

### JavaScript 함수 수정

**변경 전** (`updateFilterCounts`):
```javascript
function updateFilterCounts() {
  Object.keys(nodeCounts).forEach(type => {
    const countEl = document.querySelector(`[data-count-type="${type}"]`);
    // 필터의 개수 업데이트
  });
}
```

**변경 후**:
```javascript
function updateFilterCounts() {
  Object.keys(nodeCounts).forEach(type => {
    const countEl = document.querySelector(`.legend-count[data-count-type="${type}"]`);
    if (countEl) {
      const count = nodeCounts[type] || 0;
      countEl.textContent = `(${count.toLocaleString()})`;
    }
  });
}
```

**개선 사항**:
- ✅ 선택자 명확화: `.legend-count`로 범위 제한
- ✅ 포맷팅: 괄호와 천 단위 구분자 추가
- ✅ 안전성: `if (countEl)` 체크로 null 참조 방지

---

## 📊 성능 및 UX 영향 분석

### 성능 영향
- **렌더링**: 필터에서 개수 제거로 약간의 DOM 요소 감소 (4개 span 제거)
- **업데이트**: 동일한 API 호출 (`/api/v1/graph/node-counts`), 업데이트 대상만 변경
- **메모리**: 미미한 개선 (불필요한 DOM 요소 제거)

### UX 영향
- **정보 접근성**: ⬆️ 개선 (노드 유형 섹션에 집중된 정보)
- **시각적 정리**: ⬆️ 개선 (필터 단순화)
- **일관성**: ⬆️ 개선 (한국어만 사용)

---

## ✅ 검증 체크리스트

- [x] 필터에서 개수 제거 완료
- [x] 노드 유형에 개수 추가 완료
- [x] 영어 표현 제거 완료
- [x] CSS 스타일 추가 완료
- [x] `updateFilterCounts()` 함수 수정 완료
- [x] 불필요한 CSS 제거 완료 (`.filter-count` 스타일)
- [x] HTML 구조 정리 완료

---

## 🎯 CTO 관점 평가

### 긍정적 측면
1. **관심사 분리**: 필터(제어)와 정보 표시(노드 유형)의 역할이 명확히 분리됨
2. **유지보수성**: 구조화된 HTML로 향후 확장 용이
3. **로컬라이제이션**: 일관된 한국어 UI로 사용자 경험 개선
4. **성능**: 미미하지만 DOM 요소 감소로 렌더링 부담 감소

### 개선 제안 (선택사항)
1. **애니메이션**: 개수 변경 시 부드러운 전환 효과 추가 고려
2. **접근성**: 스크린 리더를 위한 `aria-label` 추가 고려
3. **반응형**: 모바일에서 노드 유형 섹션 레이아웃 최적화 고려

---

## 📝 변경된 파일

- `frontend/graph.html`
  - 필터 섹션: 개수 제거 (503-518줄)
  - 노드 유형 섹션: 구조 개선 및 개수 추가 (559-576줄)
  - CSS: `.legend-label`, `.legend-count` 스타일 추가 (209-210줄)
  - CSS: `.filter-count` 스타일 제거 (116-120줄)
  - JavaScript: `updateFilterCounts()` 함수 수정 (1873-1881줄)

---

**검토 완료**: 모든 요청 사항이 구현되었으며, 코드 품질과 UX가 개선되었습니다.
