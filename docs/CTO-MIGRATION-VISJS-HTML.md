# CTO 마이그레이션 문서: Vis.js HTML 구조 업데이트

**마이그레이션 일자**: 2026-02-19  
**대상**: `frontend/graph.html`, `frontend/graph.js`, `frontend/graph.css`  
**목적**: SVG 레거시 코드 제거 및 새로운 Vis.js 기반 HTML 구조로 마이그레이션

---

## 📋 마이그레이션 개요

### 변경 배경
- 기존 SVG 기반 렌더링에서 발생하는 레거시 이슈 해결
- 타 서비스에서 검증된 Vis.js + NetworkX 하이브리드 구조 적용
- 접근성 및 사용자 경험 개선

### 마이그레이션 원칙
- **확장성**: 새로운 기능 추가 용이
- **유지보수성**: 코드 구조 명확화
- **일관성**: 기존 코드 스타일 유지
- **호환성**: 기존 API 및 데이터 구조 유지
- **협업 코드**: 주석 처리된 레거시 코드로 참고 가능

---

## 🔄 주요 변경사항

### 1. HTML 구조 변경

#### 그래프 영역 (`graphArea`)
**변경 전:**
```html
<div class="graph-area" id="graphArea">
  <div class="graph-loading-overlay hidden" id="graphLoadingOverlay">
    <div class="graph-loading-spinner"></div>
    <div class="graph-loading-step" id="graphLoadingStep">...</div>
    <div class="graph-loading-hint" id="graphLoadingHint">...</div>
  </div>
  <div id="visNetworkContainer"></div>
  <div class="node-tooltip" id="tooltip"></div>
  <div class="zoom-controls">...</div>
  <div class="graph-legend">...</div>
</div>
```

**변경 후:**
```html
<div class="graph-area" id="graphArea" role="main" aria-label="그래프 시각화 영역" data-wheel-bound="1">
  <div class="loading-overlay variant-unified hidden has-progress" id="loadingOverlay" aria-live="polite" aria-busy="false">
    <!-- 단계별 진행률, 프로그레스바, 단계 인디케이터 포함 -->
  </div>
  <div id="visNetwork" aria-label="그래프 네트워크" data-drag-sync-bound="1"></div>
  <div id="graphTooltip" role="tooltip" aria-hidden="true"></div>
  <div class="graph-stats" id="graphStats" aria-label="그래프 통계"></div>
  <div class="zoom-controls" role="group" aria-label="줌 컨트롤">...</div>
  <div class="graph-legend" id="legend" role="group" aria-label="노드 타입 범례">...</div>
</div>
```

#### ID 변경 매핑
| 기존 ID | 새로운 ID | 변경 이유 |
|---------|----------|----------|
| `graphLoadingOverlay` | `loadingOverlay` | 일관성 및 간결성 |
| `graphLoadingStep` | `loadingText` | 의미 명확화 |
| `graphLoadingHint` | `loadingGuidance` | 의미 명확화 |
| `visNetworkContainer` | `visNetwork` | 간결성 (Container 불필요) |
| `tooltip` | `graphTooltip` | 네임스페이스 명확화 |
| `graph-legend` (class) | `legend` (id) | 접근성 향상 |

### 2. JavaScript 변경사항

#### 로딩 오버레이 함수 업데이트
**변경 전:**
```javascript
function showGraphLoading(stepText, hintText) {
  const overlay = document.getElementById('graphLoadingOverlay');
  const stepEl = document.getElementById('graphLoadingStep');
  const hintEl = document.getElementById('graphLoadingHint');
  // ...
}
```

**변경 후:**
```javascript
function showGraphLoading(stepText, hintText, progressPercent = null, activeStep = null) {
  const overlay = document.getElementById('loadingOverlay');
  const textEl = document.getElementById('loadingText');
  const guidanceEl = document.getElementById('loadingGuidance');
  const progressEl = document.getElementById('loadingBar');
  const stepsEl = document.getElementById('loadingSteps');
  // 프로그레스바 및 단계 인디케이터 업데이트 로직 추가
}
```

#### 주요 함수 호출 업데이트
- `showGraphLoading()` 호출 시 진행률 및 단계 정보 추가
  - 예: `showGraphLoading('데이터 로딩 중...', '노드·관계 데이터를 가져옵니다', 25, 1)`

#### ID 참조 업데이트
- `visNetworkContainer` → `visNetwork`
- `tooltip` → `graphTooltip`
- 모든 로딩 관련 ID 업데이트

### 3. CSS 변경사항

#### 새로운 스타일 추가
- `.loading-overlay`: 통합 로딩 오버레이 스타일
- `.loading-progress`: 프로그레스바 스타일
- `.loading-steps`: 단계 인디케이터 스타일
- `.step-item`, `.step-dot`, `.step-label`, `.step-line`: 단계 인디케이터 구성 요소
- `#graphTooltip`: 새로운 툴팁 스타일
- `.graph-stats`: 통계 영역 스타일

#### 레거시 스타일 주석 처리
- `.graph-loading-overlay` → 주석 처리 (참고용)
- `.node-tooltip` → 주석 처리 (참고용)
- `#visNetworkContainer` → 주석 처리 (참고용)

---

## ⚠️ 우려사항 및 주의사항

### 1. 호환성 우려사항

#### 브라우저 호환성
- **접근성 속성**: `aria-live`, `aria-busy`, `role` 속성은 최신 브라우저에서 지원
- **CSS Grid/Flexbox**: 모든 주요 브라우저 지원 (IE11 제외)
- **Backdrop Filter**: Safari 9+, Chrome 76+ 지원 (폴백: `rgba` 배경)

#### Vis.js 버전 호환성
- 현재 사용 중인 Vis.js 버전 확인 필요
- 새로운 HTML 구조가 Vis.js의 DOM 조작과 충돌하지 않는지 확인

### 2. 기능적 우려사항

#### 로딩 오버레이
- **프로그레스바**: 실제 진행률을 정확히 계산하는 로직 필요
  - 현재: 하드코딩된 진행률 (25%, 50%, 75%, 90%)
  - 권장: 실제 API 응답 시간 기반 동적 계산
- **단계 인디케이터**: 단계 수가 변경될 경우 HTML 구조 수정 필요

#### 통계 영역 (`graphStats`)
- 현재: 기본적으로 숨김 (`display: none`)
- 향후: 노드/엣지 수, 필터 상태 등 표시 기능 추가 필요
- JavaScript에서 표시/숨김 로직 구현 필요

#### 범례 (`legend`)
- `data-type` 속성 추가 (기존 `data-count-type`과 호환)
- 접근성 향상: `role="button"`, `tabindex="0"` 추가
- 키보드 네비게이션 지원 필요

### 3. 성능 우려사항

#### DOM 조작
- 로딩 오버레이의 복잡한 구조로 인한 렌더링 비용 증가 가능
- 단계 인디케이터 업데이트 시 `querySelectorAll` 사용 → 성능 모니터링 필요

#### CSS 애니메이션
- 프로그레스바 indeterminate 모드 애니메이션
- 스피너 애니메이션
- GPU 가속 활용 권장 (`transform`, `opacity` 사용)

### 4. 유지보수 우려사항

#### 코드 중복
- 레거시 코드가 주석 처리되어 있으나, 완전 제거 시 참고 불가
- 정리 계획: 마이그레이션 검증 완료 후 레거시 코드 제거 고려

#### 문서화
- 새로운 HTML 구조에 대한 상세 문서 필요
- 단계 인디케이터 단계 수 변경 시 업데이트 필요

---

## 📝 필요한 정보 및 다음 단계

### 1. 즉시 확인 필요

#### Vis.js 초기화 확인
- [ ] `visNetwork` 컨테이너가 올바르게 초기화되는지 확인
- [ ] Vis.js 이벤트 리스너가 정상 작동하는지 확인
- [ ] 툴팁이 올바르게 표시되는지 확인

#### 로딩 오버레이 동작 확인
- [ ] 각 단계별 진행률이 올바르게 표시되는지 확인
- [ ] 단계 인디케이터가 올바르게 업데이트되는지 확인
- [ ] 프로그레스바 애니메이션이 부드럽게 작동하는지 확인

#### 접근성 확인
- [ ] 스크린 리더에서 올바르게 읽히는지 확인
- [ ] 키보드 네비게이션이 작동하는지 확인
- [ ] 포커스 관리가 올바른지 확인

### 2. 향후 개선 사항

#### 프로그레스바 개선
```javascript
// 현재: 하드코딩된 진행률
showGraphLoading('데이터 로딩 중...', '...', 25, 1);

// 권장: 실제 진행률 계산
async function loadGraphWithProgress() {
  const totalSteps = 5;
  let currentStep = 0;
  
  showGraphLoading('연결 확인 중...', '...', (currentStep++ / totalSteps) * 100, 0);
  await connectToBackend();
  
  showGraphLoading('데이터 로딩 중...', '...', (currentStep++ / totalSteps) * 100, 1);
  await loadData();
  // ...
}
```

#### 통계 영역 구현
```javascript
function updateGraphStats() {
  const statsEl = document.getElementById('graphStats');
  if (!statsEl) return;
  
  const nodeCount = NODES.length;
  const edgeCount = EDGES.length;
  const visibleNodes = NODES.filter(n => activeFilters.has(n.type)).length;
  
  statsEl.innerHTML = `
    <div>노드: ${visibleNodes} / ${nodeCount}</div>
    <div>관계: ${edgeCount}</div>
  `;
  statsEl.style.display = 'block';
}
```

#### 범례 키보드 네비게이션
```javascript
document.querySelectorAll('.legend-row').forEach(row => {
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const type = row.getAttribute('data-type') || row.getAttribute('data-count-type');
      toggleFilter(type);
    }
  });
});
```

### 3. 테스트 체크리스트

#### 기능 테스트
- [ ] 그래프 로딩 시 로딩 오버레이 표시
- [ ] 각 단계별 진행률 표시
- [ ] Vis.js 네트워크 렌더링
- [ ] 툴팁 표시/숨김
- [ ] 줌 컨트롤 작동
- [ ] 범례 필터 작동

#### 브라우저 테스트
- [ ] Chrome (최신)
- [ ] Firefox (최신)
- [ ] Safari (최신)
- [ ] Edge (최신)

#### 접근성 테스트
- [ ] 스크린 리더 (NVDA/JAWS/VoiceOver)
- [ ] 키보드 네비게이션
- [ ] 고대비 모드
- [ ] 확대/축소 (200%)

### 4. 롤백 계획

마이그레이션 실패 시 롤백 절차:
1. 레거시 코드 주석 해제
2. 새로운 코드 주석 처리
3. ID 참조 원복
4. CSS 원복

---

## 📊 마이그레이션 체크리스트

### 완료된 작업
- [x] HTML 구조 마이그레이션
- [x] 기존 코드 주석 처리
- [x] JavaScript ID 참조 업데이트
- [x] 로딩 오버레이 함수 업데이트
- [x] CSS 스타일 추가
- [x] 레거시 CSS 주석 처리

### 검증 필요 작업
- [ ] 브라우저 호환성 테스트
- [ ] 기능 동작 확인
- [ ] 접근성 테스트
- [ ] 성능 테스트
- [ ] 사용자 테스트

---

## 🔗 관련 문서

- [Vis.js 공식 문서](https://visjs.github.io/vis-network/docs/network/)
- [ARIA 접근성 가이드](https://www.w3.org/WAI/ARIA/apg/)
- [기존 그래프 시각화 아키텍처 문서](./PYGRAPHVIZ-VISJS-HYBRID.md)

---

## 📌 요약

이번 마이그레이션은 **SVG 레거시 코드를 제거**하고 **Vis.js 기반 HTML 구조로 전환**하는 작업입니다. 주요 개선사항:

1. **접근성 강화**: ARIA 속성 추가, 키보드 네비게이션 지원
2. **사용자 경험 개선**: 단계별 진행률 표시, 프로그레스바 추가
3. **코드 구조 개선**: 명확한 ID 네이밍, 일관된 구조
4. **확장성 향상**: 통계 영역 추가, 향후 기능 확장 용이

**주의**: 마이그레이션 후 충분한 테스트를 거쳐 프로덕션 배포를 권장합니다.
