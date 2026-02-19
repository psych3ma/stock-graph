# UX 검토 및 프로덕트 스펙: GraphIQ 사용성 개선

## 문서 정보
- **작성일**: 2026-02-17
- **검토자**: UX 전문가
- **대상**: 개발팀
- **우선순위**: P0 (즉시 수정) / P1 (다음 스프린트) / P2 (향후 개선)

---

## 1. 문제 요약 및 영향도

### 발견된 주요 이슈

| # | 문제 | 심각도 | 사용자 영향 | 비즈니스 영향 |
|---|------|--------|------------|--------------|
| **1** | 로고 클릭 시 홈/새로고침 미동작 | 🔴 높음 | 네비게이션 혼란, 사용자 이탈 | 브랜드 신뢰도 저하 |
| **2** | 노드 겹침으로 가독성 극도 저하 (4,919개) | 🔴 높음 | 핵심 기능 사용 불가 | 제품 가치 상실 |
| **3** | 노드 상세/채팅 버튼 발견성 낮음 | 🟡 중간 | 기능 미사용, 사용자 좌절 | 기능 활용도 저하 |
| **4** | 검색 기능 미동작/피드백 없음 | 🔴 높음 | 핵심 기능 사용 불가 | 사용자 이탈 |

---

## 2. 상세 스펙: 이슈별 해결 방안

### 🔴 P0-1: 로고 클릭 시 홈/새로고침 기능 추가

#### 문제 분석
- **현재 상태**: `.logo` 요소에 클릭 이벤트 핸들러가 없음
- **사용자 기대**: 로고 클릭 시 홈으로 이동 또는 페이지 새로고침 (웹 표준 UX 패턴)
- **영향**: 사용자가 실수로 필터/검색 상태를 변경했을 때 빠르게 초기화할 방법이 없음

#### 요구사항

**기능 스펙**:
1. **로고 클릭 동작**:
   - 클릭 시 전체 그래프 상태 초기화 (필터, 검색, 선택 노드 리셋)
   - 그래프를 전체 뷰로 fit (`visNetwork.fit()`)
   - 우측 패널을 빈 상태로 리셋 (`showEmptyPanel()`)
   - 검색 입력 필드 초기화

2. **시각적 피드백**:
   - 로고에 `cursor: pointer` 스타일 추가
   - 호버 시 약간의 opacity 변화 (0.9 → 1.0) 또는 scale 효과 (1.0 → 1.02)
   - 클릭 시 즉각적인 피드백 (약간의 scale down: 0.98)

3. **접근성**:
   - `role="button"` 추가
   - `aria-label="홈으로 이동"` 추가
   - 키보드 접근성: `tabindex="0"`, Enter/Space 키 지원

#### 기술 구현

**HTML 수정** (`frontend/graph.html`):
```html
<div class="logo" id="logoHome" role="button" aria-label="홈으로 이동" tabindex="0">
  <div class="logo-mark">
    <!-- SVG 동일 -->
  </div>
  <span class="logo-name">GraphIQ</span>
</div>
```

**CSS 수정** (`frontend/graph.css`):
```css
.logo {
  display: flex;
  align-items: center;
  gap: 7px;
  user-select: none;
  margin-right: 4px;
  cursor: pointer; /* 추가 */
  transition: opacity 0.15s, transform 0.15s; /* 추가 */
}

.logo:hover {
  opacity: 0.9;
  transform: scale(1.02);
}

.logo:active {
  transform: scale(0.98);
}

.logo:focus {
  outline: 2px solid var(--pwc-orange);
  outline-offset: 2px;
  border-radius: var(--r);
}
```

**JavaScript 수정** (`frontend/graph.js`):
```javascript
// INIT 섹션에 추가
function resetToHome() {
  // 검색 초기화
  const searchInput = document.getElementById('nodeSearch');
  if (searchInput) searchInput.value = '';
  
  // 선택 노드 초기화
  selectedNode = null;
  
  // 필터 초기화 (모든 타입 활성화)
  activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.add('active');
  });
  
  // 그래프 재렌더링
  renderGraph();
  
  // 전체 뷰로 fit
  if (visNetwork) {
    visNetwork.fit({ animation: { duration: 300 } });
  }
  
  // 우측 패널 빈 상태로
  showEmptyPanel();
  
  // 상태 메시지 업데이트
  updateStatus('홈으로 이동했습니다', true);
}

// 로고 클릭 이벤트
const logoHome = document.getElementById('logoHome');
if (logoHome) {
  logoHome.addEventListener('click', resetToHome);
  logoHome.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      resetToHome();
    }
  });
}
```

**테스트 체크리스트**:
- [ ] 로고 클릭 시 그래프가 전체 뷰로 fit되는지
- [ ] 검색 입력이 초기화되는지
- [ ] 필터가 모두 활성화되는지
- [ ] 우측 패널이 빈 상태로 리셋되는지
- [ ] 키보드(Tab → Enter)로 동작하는지
- [ ] 호버/클릭 시각적 피드백이 있는지

---

### 🔴 P0-2: 검색 기능 개선 및 피드백 강화

#### 문제 분석
- **현재 상태**: 
  - `input` 이벤트 리스너가 있으나 DOMContentLoaded 전 실행 시 `null` 에러 가능
  - 검색 결과가 없을 때 피드백 없음
  - 첫 번째 매치만 선택되어 여러 결과 중 선택 불가
  - 검색어 하이라이트 없음

#### 요구사항

**기능 스펙**:

1. **검색 동작**:
   - 입력 시 실시간 검색 (debounce 300ms)
   - 검색어와 일치하는 모든 노드 하이라이트
   - 검색 결과가 없을 때 명확한 메시지 표시
   - 검색 결과가 여러 개일 때 드롭다운 목록 표시 (최대 10개)

2. **시각적 피드백**:
   - 검색된 노드는 강조 표시 (border 색상 변경, glow 효과)
   - 검색어 하이라이트 (노드 라벨 내)
   - 검색 결과 드롭다운 (검색창 하단, 자동완성 스타일)
   - 검색 결과 없음 메시지 (검색창 하단)

3. **키보드 네비게이션**:
   - Arrow Down/Up: 드롭다운 항목 선택
   - Enter: 첫 번째 결과 선택
   - Escape: 검색 취소

#### 기술 구현

**HTML 수정** (`frontend/graph.html`):
```html
<div class="search-wrap">
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><!-- 동일 --></svg>
  <input class="search-input" placeholder="회사명, 주주명 검색..." id="nodeSearch" autocomplete="off"/>
  <!-- 검색 결과 드롭다운 추가 -->
  <div class="search-results hidden" id="searchResults"></div>
</div>
```

**CSS 수정** (`frontend/graph.css`):
```css
.search-wrap {
  flex: 1;
  max-width: 360px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 0 12px;
  height: 32px;
  transition: all 0.15s;
  position: relative; /* 드롭다운 위치 기준 */
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  box-shadow: var(--shadow-md);
  max-height: 300px;
  overflow-y: auto;
  z-index: 200;
}

.search-results.hidden {
  display: none;
}

.search-result-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.12s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover,
.search-result-item.selected {
  background: var(--surface-tint);
}

.search-result-label {
  flex: 1;
  font-size: 13px;
  color: var(--text-1);
}

.search-result-type {
  font-size: 11px;
  color: var(--text-3);
  padding: 2px 6px;
  border-radius: 12px;
  background: var(--surface-2);
}

.search-no-results {
  padding: 16px;
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
}
```

**JavaScript 수정** (`frontend/graph.js`):
```javascript
// SEARCH 섹션 수정
let searchTimeout = null;
let searchResults = [];
let selectedSearchIndex = -1;

function performSearch(query) {
  if (!query || query.trim().length === 0) {
    clearSearchHighlight();
    hideSearchResults();
    renderGraph();
    return;
  }
  
  const q = query.toLowerCase().trim();
  searchResults = NODES.filter(n => 
    n.label.toLowerCase().includes(q) || 
    (n.sub && n.sub.toLowerCase().includes(q))
  ).slice(0, 10);
  
  if (searchResults.length === 0) {
    showSearchNoResults();
  } else {
    showSearchResults(searchResults, q);
    highlightSearchResults(searchResults);
  }
}

function highlightSearchResults(results) {
  // Vis.js에서 노드 하이라이트
  if (visNetwork && results.length > 0) {
    const nodeIds = results.map(n => n.id);
    visNetwork.selectNodes(nodeIds);
    // 첫 번째 결과로 이동
    if (results.length > 0) {
      visNetwork.focus(results[0].id, {
        scale: 1.5,
        animation: { duration: 300 }
      });
    }
  }
}

function clearSearchHighlight() {
  if (visNetwork) {
    visNetwork.unselectAll();
  }
}

function showSearchResults(results, query) {
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  
  resultsEl.innerHTML = results.map((node, idx) => {
    const label = highlightMatch(node.label, query);
    const typeLabel = { company: '회사', person: '개인주주', major: '최대주주', institution: '기관' }[node.type] || node.type;
    return `
      <div class="search-result-item ${idx === selectedSearchIndex ? 'selected' : ''}" 
           data-node-id="${node.id}" 
           data-index="${idx}">
        <div class="search-result-label">${label}</div>
        <div class="search-result-type">${typeLabel}</div>
      </div>
    `;
  }).join('');
  
  resultsEl.classList.remove('hidden');
  
  // 클릭 이벤트
  resultsEl.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const nodeId = item.dataset.nodeId;
      const node = NODES.find(n => n.id === nodeId);
      if (node) {
        selectNode(node);
        hideSearchResults();
        document.getElementById('nodeSearch').value = '';
      }
    });
  });
}

function showSearchNoResults() {
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  
  resultsEl.innerHTML = `
    <div class="search-no-results">
      검색 결과가 없습니다
    </div>
  `;
  resultsEl.classList.remove('hidden');
}

function hideSearchResults() {
  const resultsEl = document.getElementById('searchResults');
  if (resultsEl) {
    resultsEl.classList.add('hidden');
  }
}

function highlightMatch(text, query) {
  const regex = new RegExp(`(${query})`, 'gi');
  return esc(text).replace(regex, '<mark style="background: var(--pwc-orange); color: white; padding: 0 2px;">$1</mark>');
}

// 검색 입력 이벤트 (DOMContentLoaded 후 실행 보장)
function setupSearch() {
  const searchInput = document.getElementById('nodeSearch');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', function() {
    const query = this.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });
  
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSearchIndex = Math.min(selectedSearchIndex + 1, searchResults.length - 1);
      updateSearchSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSearchIndex = Math.max(selectedSearchIndex - 1, -1);
      updateSearchSelection();
    } else if (e.key === 'Enter' && selectedSearchIndex >= 0 && searchResults[selectedSearchIndex]) {
      e.preventDefault();
      const node = searchResults[selectedSearchIndex];
      selectNode(node);
      hideSearchResults();
      this.value = '';
    } else if (e.key === 'Escape') {
      hideSearchResults();
      this.value = '';
      clearSearchHighlight();
    }
  });
  
  // 검색창 외부 클릭 시 드롭다운 닫기
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) {
      hideSearchResults();
    }
  });
}

function updateSearchSelection() {
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  
  resultsEl.querySelectorAll('.search-result-item').forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedSearchIndex);
  });
}

// INIT 섹션에 추가
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSearch);
} else {
  setupSearch();
}
```

**테스트 체크리스트**:
- [ ] 검색 입력 시 실시간 결과 표시되는지
- [ ] 검색 결과가 없을 때 메시지 표시되는지
- [ ] 검색된 노드가 하이라이트되는지
- [ ] 드롭다운에서 항목 선택 시 노드 선택되는지
- [ ] 키보드 네비게이션(Arrow, Enter, Escape) 동작하는지
- [ ] 검색어 하이라이트가 표시되는지

---

### 🔴 P0-3: 노드 겹침 문제 해결 (레이아웃 최적화)

#### 문제 분석
- **현재 상태**: 4,919개 노드가 심하게 겹쳐있어 가독성 극도 저하
- **원인**: 
  - 대량 노드에 대한 레이아웃 알고리즘 한계
  - 초기 배치 알고리즘의 노드 간 최소 거리 부족
  - 클러스터링/그룹화 기능 미활용

#### 요구사항

**기능 스펙**:

1. **즉시 적용 가능한 개선**:
   - 노드 간 최소 거리 증가 (`minDist` 320 → 500)
   - 반발력 강화 (`repulsionStrength` 350 → 450)
   - 충돌 감지 반경 확대 (`collisionRadiusMultiplier` 4.0 → 5.0)
   - 초기 배치 반경 확대 (노드 수에 비례)

2. **중기 개선 (P1)**:
   - 클러스터링 기능 활성화 (Vis.js `clusterByConnection` 또는 커스텀)
   - 노드 타입별 그룹화 (회사/개인주주/기관 등)
   - 줌 레벨에 따른 자동 클러스터링/확장

3. **장기 개선 (P2)**:
   - 서버 사이드 레이아웃 최적화 (PyGraphviz `overlap=false`, `sep=+30`)
   - 대량 노드 필터링 (기본 표시 노드 수 제한, 확장 시 로드)
   - 히어로 노드(Hero Node) 중심 레이아웃 (중요 노드 강조)

#### 기술 구현

**즉시 적용** (`frontend/graph.js`):
```javascript
const LAYOUT_CONFIG = {
  force: {
    gravity: 0,
    minDist: 500, // 320 → 500 (노드 간 최소 거리 증가)
    repulsionRange: 5.0, // 4.0 → 5.0 (반발 범위 확대)
    repulsionStrength: 450, // 350 → 450 (반발력 강화)
    collisionRadiusMultiplier: 5.0, // 4.0 → 5.0 (충돌 감지 반경 확대)
    layoutRadiusMultiplier: 4, // 3 → 4 (레이아웃 반경 확대)
    idealDistMin: 500, // 360 → 500
    idealDistMax: 1200, // 800 → 1200
    // ... 나머지 설정 동일
    repulsionOnlyIter: 300, // 250 → 300 (반발 워밍업 확대)
  },
  // ...
};
```

**초기 배치 개선** (`initPositions` 함수):
```javascript
// 초기 배치 반경을 노드 수에 비례하여 확대
const baseRadius = Math.max(400, Math.sqrt(NODES.length) * 15); // 기존보다 2배 확대
```

**Vis.js 옵션 개선** (`renderGraphWithVisJs` 함수):
```javascript
const options = {
  nodes: {
    font: { background: 'white', strokeWidth: 2, strokeColor: 'white' },
    borderWidth: 2,
    // 노드 크기 조정 (겹침 방지)
    size: (NODE_RADIUS[n.type] || 18) * 2.5, // 2 → 2.5
  },
  edges: {
    smooth: { type: 'continuous', roundness: 0.5 },
    arrows: { to: { enabled: true, scaleFactor: 0.8 } },
  },
  physics: { enabled: false },
  interaction: { 
    dragNodes: true, 
    zoomView: true, 
    dragView: true,
    tooltipDelay: 100, // 툴팁 지연 감소
  },
  layout: { improvedLayout: false },
  // 클러스터링 옵션 추가 (P1)
  // clustering: {
  //   enabled: true,
  //   clusterByConnection: true,
  //   maxNodes: 50,
  // }
};
```

**테스트 체크리스트**:
- [ ] 노드 간 거리가 충분한지 (겹침 최소화)
- [ ] 레이아웃 계산 시간이 수용 가능한지 (< 5초)
- [ ] 줌 아웃 시에도 노드가 구분되는지
- [ ] 대량 노드(5000+)에서도 동작하는지

---

### 🟡 P1-1: 노드 상세/채팅 버튼 발견성 개선

#### 문제 분석
- **현재 상태**: 우측 패널 하단에 버튼이 위치하여 스크롤 없이는 보이지 않음
- **사용자 기대**: 노드를 선택하면 즉시 상호작용 옵션이 보여야 함

#### 요구사항

**기능 스펙**:

1. **버튼 위치 개선**:
   - 노드 상세 헤더 바로 아래로 이동 (속성 섹션 위)
   - 고정 위치 (sticky)로 스크롤 시에도 항상 보이도록

2. **시각적 강화**:
   - 버튼 크기 확대 (padding 증가)
   - 아이콘 + 텍스트 명확화
   - 호버 시 강조 효과

3. **대안 제시**:
   - 그래프 영역 내 플로팅 버튼 추가 (노드 선택 시 표시)
   - 우측 패널 상단에 빠른 액션 버튼 추가

#### 기술 구현

**CSS 수정** (`frontend/graph.css`):
```css
.nd-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: sticky; /* 추가 */
  top: 0; /* 추가 */
  background: var(--surface); /* 추가 */
  z-index: 10; /* 추가 */
}

/* 버튼을 헤더 바로 아래로 이동 */
.nd-actions {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  position: sticky; /* 추가 */
  top: 120px; /* 헤더 높이 + 여유 */
  background: var(--surface); /* 추가 */
  z-index: 9; /* 추가 */
}

.ego-map-btn,
.ask-context-btn {
  margin: 0; /* 기존 margin 제거 */
  width: 100%;
  /* 나머지 스타일 동일 */
}
```

**JavaScript 수정** (`renderNodeDetail`, `renderNodeDetailFallback` 함수):
```javascript
// 버튼을 별도 섹션으로 분리
detail.innerHTML = `
  <div class="nd-header">
    <!-- 헤더 내용 동일 -->
  </div>
  
  <!-- 액션 버튼 섹션 추가 (헤더 바로 아래) -->
  <div class="nd-actions">
    <button class="ego-map-btn anim" onclick="loadEgoGraph('${data.id}')">
      <!-- 버튼 내용 동일 -->
    </button>
    <button class="ask-context-btn anim" onclick="openChatWithContext('${data.id}', '${esc(data.label)}', '${data.type}')">
      <!-- 버튼 내용 동일 -->
    </button>
  </div>
  
  <!-- 나머지 섹션들 (stats, related, props) -->
  ${data.stats && data.stats.length > 0 ? `...` : ''}
  ${data.related && data.related.length > 0 ? `...` : ''}
  ${data.props && Object.keys(data.props).length > 0 ? `...` : ''}
`;
```

**그래프 영역 플로팅 버튼 (선택적, P2)**:
```html
<!-- graph.html에 추가 -->
<div class="graph-floating-actions hidden" id="floatingActions">
  <button class="floating-action-btn" id="floatingEgoMap" title="지배구조 맵 보기">
    <svg><!-- 지도 아이콘 --></svg>
  </button>
  <button class="floating-action-btn" id="floatingChat" title="AI에게 질문하기">
    <svg><!-- 채팅 아이콘 --></svg>
  </button>
</div>
```

**테스트 체크리스트**:
- [ ] 노드 선택 시 버튼이 즉시 보이는지
- [ ] 스크롤 시에도 버튼이 고정되어 있는지
- [ ] 버튼 클릭이 정상 동작하는지
- [ ] 모바일에서도 접근 가능한지

---

## 3. 우선순위 및 일정

### 즉시 수정 (P0) - 이번 스프린트
1. ✅ 로고 클릭 기능 추가 (1-2시간)
2. ✅ 검색 기능 개선 (2-3시간)
3. ✅ 노드 겹침 최적화 (즉시 적용 가능한 파라미터 조정, 1시간)

### 다음 스프린트 (P1) - 1-2주 내
4. 노드 상세/채팅 버튼 발견성 개선 (2-3시간)
5. 클러스터링 기능 활성화 (4-6시간)
6. 서버 사이드 레이아웃 최적화 (백엔드 협업, 1-2일)

### 향후 개선 (P2) - 로드맵
7. 히어로 노드 중심 레이아웃
8. 대량 노드 필터링/지연 로딩
9. 그래프 영역 플로팅 버튼

---

## 4. 성공 지표 (KPI)

### 정량적 지표
- **노드 겹침 감소**: 겹치는 노드 비율 < 5% (현재 추정 80%+)
- **검색 성공률**: 검색 시도 대비 노드 선택 성공률 > 90%
- **기능 발견률**: 노드 상세/채팅 버튼 클릭률 > 30% (현재 추정 < 5%)

### 정성적 지표
- 사용자 테스트: "그래프를 읽을 수 있다" 응답률 > 80%
- 사용자 테스트: "원하는 노드를 찾을 수 있다" 응답률 > 90%
- 사용자 테스트: "버튼을 쉽게 찾을 수 있다" 응답률 > 70%

---

## 5. 참고 자료

- **Vis.js 클러스터링 문서**: https://visjs.github.io/vis-network/docs/network/clustering.html
- **접근성 가이드라인**: WCAG 2.1 Level AA
- **웹 표준 UX 패턴**: 로고 클릭 = 홈 이동 (de facto standard)

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-02-17
