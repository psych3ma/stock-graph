# CTO Code Review: 지배구조 맵 보기 기능 수정 사항

**검토자**: CTO 전문가  
**작업 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 목차

1. [개요](#개요)
2. [하드코딩 분석](#하드코딩-분석)
3. [사이드 이펙트 분석](#사이드-이펙트-분석)
4. [호환성 검토](#호환성-검토)
5. [일관성 검토](#일관성-검토)
6. [유지보수성 검토](#유지보수성-검토)
7. [확장성 검토](#확장성-검토)
8. [협업 코드 검토](#협업-코드-검토)
9. [개선 권장 사항](#개선-권장-사항)

---

## 개요

### 검토 대상 코드

**파일**: `frontend/graph.js`  
**함수**: `loadEgoGraph()` (라인 407-527)  
**관련 CSS**: `frontend/graph.css` (라인 2206-2250)

### 주요 변경 사항

1. 에러 처리 개선 (`alert()` → 인라인 메시지)
2. 데이터 검증 추가 (`ego_id` 검증, 노드 존재 확인)
3. 폴백 로직 추가 (첫 번째 노드 사용)
4. 용어 통일 ("Ego 그래프" → "지배구조 맵")

---

## 하드코딩 분석

### 🔴 Critical Issues

#### 1. HTML 템플릿 하드코딩

**문제점**:
```javascript
nodeDetail.innerHTML = `
  <div class="error-message-inline">
    <div class="error-icon-small">⚠️</div>
    <div class="error-content">
      <p class="error-title">지배구조 맵을 불러올 수 없습니다</p>
      <p class="error-detail">해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.</p>
      <button class="btn-retry" onclick="loadEgoGraph('${targetNodeId}')">다시 시도</button>
    </div>
  </div>
`;
```

**문제**:
- HTML 구조가 코드에 하드코딩됨
- 텍스트가 코드에 직접 포함됨 (다국어 지원 어려움)
- 인라인 이벤트 핸들러 사용 (`onclick`)
- XSS 취약점 가능성 (하지만 `esc()` 사용으로 완화)

**영향**:
- 유지보수성: HTML 구조 변경 시 코드 수정 필요
- 확장성: 다른 에러 타입 추가 시 코드 중복
- 협업: 디자이너가 HTML 구조 변경 시 개발자 개입 필요

#### 2. API 파라미터 하드코딩

**문제점**:
```javascript
const res = await apiCall(
  `/api/v1/graph/ego?node_id=${encodeURIComponent(targetNodeId)}&max_hops=2&max_nodes=120`,
);
```

**문제**:
- `max_hops=2`, `max_nodes=120` 값이 하드코딩됨
- 사용자 설정이나 환경에 따라 조정 불가능

**영향**:
- 확장성: 대용량 그래프나 작은 그래프에 대한 유연성 부족
- 테스트: 다양한 파라미터로 테스트하기 어려움

#### 3. 에러 메시지 하드코딩

**문제점**:
```javascript
updateStatus("지배구조 맵 데이터 없음", false);
updateStatus("지배구조 맵 데이터 오류", false);
updateStatus("지배구조 맵 노드 없음", false);
updateStatus("지배구조 맵 로드 실패", false, ERROR_CODES.NEO4J_CONNECTION_FAILED);
```

**문제**:
- 에러 메시지가 코드에 직접 포함됨
- 다국어 지원 어려움
- 메시지 변경 시 코드 수정 필요

**영향**:
- 확장성: 다국어 지원 시 코드 수정 필요
- 유지보수성: 메시지 변경 시 여러 곳 수정 필요

### 🟡 Medium Issues

#### 4. 인라인 이벤트 핸들러

**문제점**:
```javascript
<button class="btn-retry" onclick="loadEgoGraph('${targetNodeId}')">다시 시도</button>
```

**문제**:
- 인라인 이벤트 핸들러 사용 (`onclick`)
- 이벤트 위임 패턴 미사용
- 이벤트 리스너 관리 어려움

**영향**:
- 유지보수성: 이벤트 핸들러 변경 시 HTML 수정 필요
- 협업: 이벤트 핸들러와 HTML 구조 결합

#### 5. CSS 클래스명 하드코딩

**문제점**:
```javascript
class="error-message-inline"
class="error-icon-small"
class="error-content"
class="error-title"
class="error-detail"
class="btn-retry"
```

**문제**:
- CSS 클래스명이 코드에 하드코딩됨
- 클래스명 변경 시 코드 수정 필요

**영향**:
- 유지보수성: CSS 클래스명 변경 시 코드 수정 필요
- 협업: CSS와 JavaScript 간 결합도 증가

### ✅ Good Practices

#### 6. 에러 코드 사용

**좋은 점**:
```javascript
ERROR_CODES.NEO4J_CONNECTION_FAILED
```

- 에러 코드를 상수로 정의하여 사용
- 에러 타입을 명확히 구분

#### 7. XSS 방지

**좋은 점**:
```javascript
${esc(errorMessage)}
```

- `esc()` 함수로 XSS 방지
- 사용자 입력 안전하게 처리

---

## 사이드 이펙트 분석

### 🔴 Critical Side Effects

#### 1. `nodeDetail.innerHTML` 직접 조작

**문제점**:
```javascript
const nodeDetail = document.getElementById("nodeDetail");
if (nodeDetail) {
  nodeDetail.innerHTML = `...`;
}
```

**사이드 이펙트**:
- 기존 이벤트 리스너 손실 가능성
- `renderNodeDetail()` 또는 `renderNodeDetailFallback()`에서 설정한 이벤트 리스너 제거
- 다른 함수가 `nodeDetail`에 의존하는 경우 문제 발생 가능

**영향 범위**:
- `renderNodeDetail()`: 노드 상세 정보 렌더링
- `renderNodeDetailFallback()`: 폴백 노드 상세 정보 렌더링
- `selectNode()`: 노드 선택 시 상세 정보 표시

**검증 필요**:
- `nodeDetail`에 이벤트 리스너가 있는지 확인
- `nodeDetail`을 참조하는 다른 함수 확인

#### 2. 전역 상태 변경 (`NODES`, `EDGES`)

**문제점**:
```javascript
NODES = res.nodes;
EDGES = res.edges;
```

**사이드 이펙트**:
- 전역 `NODES`, `EDGES` 변수를 완전히 덮어씀
- 기존 그래프 데이터 손실
- 다른 함수가 `NODES`, `EDGES`를 참조하는 경우 예상치 못한 동작 가능

**영향 범위**:
- `renderGraph()`: 그래프 렌더링
- `selectNode()`: 노드 선택
- `toggleFilter()`: 필터 토글
- `loadGraph()`: 전체 그래프 로드

**검증 필요**:
- `isEgoMode` 플래그로 보호되는지 확인
- `exitEgoMode()`에서 원래 상태 복원하는지 확인

#### 3. `selectedNode` 상태 변경

**문제점**:
```javascript
selectedNode = NODES.find((n) => n.id === res.ego_id) || null;
```

**사이드 이펙트**:
- 전역 `selectedNode` 변수 변경
- 다른 함수가 `selectedNode`를 참조하는 경우 예상치 못한 동작 가능

**영향 범위**:
- `renderGraph()`: 선택된 노드 하이라이트
- `selectNode()`: 노드 선택 로직
- `showEmptyPanel()`: 빈 패널 표시

**검증 필요**:
- `selectedNode` 변경이 다른 함수에 영향을 주는지 확인

### 🟡 Medium Side Effects

#### 4. `isEgoMode` 상태 변경

**문제점**:
```javascript
isEgoMode = true;
// ...
isEgoMode = false; // 에러 시
```

**사이드 이펙트**:
- `isEgoMode` 플래그 변경으로 다른 함수 동작 변경 가능
- `exitEgoMode()`에서만 `isEgoMode`를 `false`로 설정하는 것으로 가정한 코드에 영향

**영향 범위**:
- `exitEgoMode()`: Ego 모드 종료
- `loadGraph()`: 전체 그래프 로드 (Ego 모드 확인)

**검증 필요**:
- `isEgoMode`를 확인하는 모든 함수 확인

#### 5. `activeFilters` 재설정

**문제점**:
```javascript
activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
```

**사이드 이펙트**:
- 사용자가 설정한 필터 상태 초기화
- Ego 그래프 로드 후 필터 상태가 변경됨

**영향 범위**:
- `toggleFilter()`: 필터 토글
- `renderGraph()`: 필터링된 노드 렌더링

**검증 필요**:
- Ego 모드에서 필터 상태를 유지해야 하는지 확인

---

## 호환성 검토

### ✅ Backward Compatibility

**좋은 점**:
- 기존 API 엔드포인트 사용 (`/api/v1/graph/ego`)
- 기존 함수 시그니처 유지 (`loadEgoGraph(nodeId)`)
- 기존 CSS 클래스명 사용 (새로운 클래스 추가만)

**잠재적 문제**:
- `nodeDetail.innerHTML` 직접 조작으로 인한 호환성 문제 가능성
- 기존 이벤트 리스너 손실 가능성

### ✅ Browser Compatibility

**좋은 점**:
- 표준 DOM API 사용 (`getElementById`, `innerHTML`)
- `template literals` 사용 (ES6, 모든 모던 브라우저 지원)
- `async/await` 사용 (ES2017, 모든 모던 브라우저 지원)

**검증 필요**:
- 구형 브라우저 지원 필요 시 폴백 확인

---

## 일관성 검토

### 🔴 Inconsistencies

#### 1. 에러 처리 패턴 불일치

**문제점**:
- `showConnectionError()`: 그래프 영역에 에러 표시
- `loadEgoGraph()` catch 블록: 노드 상세 패널에 에러 표시
- 다른 함수들: 다양한 에러 처리 방식

**영향**:
- 일관성 부족으로 인한 사용자 혼란 가능성
- 유지보수성 저하

#### 2. HTML 생성 방식 불일치

**문제점**:
- `showConnectionError()`: `innerHTML` 사용
- `loadEgoGraph()` catch 블록: `innerHTML` 사용
- `renderNodeDetail()`: `innerHTML` 사용
- `renderNodeDetailFallback()`: `innerHTML` 사용

**영향**:
- HTML 생성 방식이 일관되지 않음
- 템플릿 엔진이나 컴포넌트 시스템 미사용

### ✅ Consistent Patterns

#### 3. 에러 코드 사용

**좋은 점**:
- `ERROR_CODES` 상수 사용으로 일관성 유지
- 에러 타입별 분류로 일관된 처리

#### 4. 상태 관리

**좋은 점**:
- `isEgoMode` 플래그로 상태 관리
- `egoCenterId`로 중심 노드 추적

---

## 유지보수성 검토

### 🔴 Maintenance Issues

#### 1. HTML 템플릿 중복

**문제점**:
- 에러 메시지 HTML이 두 곳에 중복됨 (404 에러, 기타 에러)
- HTML 구조 변경 시 여러 곳 수정 필요

**개선 필요**:
- HTML 템플릿을 함수로 분리
- 템플릿 엔진 사용 고려

#### 2. 에러 메시지 중복

**문제점**:
- "지배구조 맵을 불러올 수 없습니다" 메시지가 여러 곳에 하드코딩됨
- 메시지 변경 시 여러 곳 수정 필요

**개선 필요**:
- 에러 메시지를 상수로 분리
- 다국어 지원을 위한 메시지 시스템 구축

#### 3. 매직 넘버

**문제점**:
- `max_hops=2`, `max_nodes=120` 값이 하드코딩됨
- 값의 의미가 명확하지 않음

**개선 필요**:
- 상수로 분리하여 의미 명확화
- 설정 파일로 분리하여 조정 가능하게

### ✅ Good Practices

#### 4. 함수 분리

**좋은 점**:
- `loadEgoGraph()` 함수가 명확한 책임을 가짐
- 에러 처리 로직이 함수 내부에 캡슐화됨

#### 5. 주석 및 문서화

**좋은 점**:
- CTO 주석으로 의도 명확화
- 코드 변경 이유 문서화

---

## 확장성 검토

### 🔴 Scalability Issues

#### 1. 하드코딩된 파라미터

**문제점**:
- `max_hops=2`, `max_nodes=120` 값이 하드코딩됨
- 대용량 그래프나 작은 그래프에 대한 유연성 부족

**개선 필요**:
- 사용자 설정으로 분리
- 동적 파라미터 조정 기능 추가

#### 2. HTML 템플릿 하드코딩

**문제점**:
- HTML 구조가 코드에 하드코딩됨
- 다른 에러 타입 추가 시 코드 중복

**개선 필요**:
- 템플릿 함수로 분리
- 컴포넌트 시스템 도입 고려

#### 3. 다국어 지원 부재

**문제점**:
- 에러 메시지가 한국어로 하드코딩됨
- 다국어 지원 어려움

**개선 필요**:
- 다국어 지원 시스템 구축
- 메시지 리소스 파일 분리

### ✅ Scalable Patterns

#### 4. 에러 코드 시스템

**좋은 점**:
- `ERROR_CODES` 상수로 에러 타입 확장 용이
- 새로운 에러 타입 추가 시 코드 수정 최소화

#### 5. 모듈화

**좋은 점**:
- 함수 단위로 모듈화
- 책임 분리로 확장 용이

---

## 협업 코드 검토

### 🔴 Collaboration Issues

#### 1. HTML/CSS/JS 결합도

**문제점**:
- HTML 구조가 JavaScript 코드에 포함됨
- CSS 클래스명이 JavaScript 코드에 하드코딩됨
- 디자이너가 HTML/CSS 변경 시 개발자 개입 필요

**개선 필요**:
- HTML 템플릿을 별도 파일로 분리
- CSS 클래스명을 상수로 분리

#### 2. 인라인 이벤트 핸들러

**문제점**:
- `onclick="loadEgoGraph('${targetNodeId}')"` 인라인 이벤트 핸들러 사용
- 이벤트 핸들러와 HTML 구조 결합

**개선 필요**:
- `addEventListener` 사용
- 이벤트 위임 패턴 적용

### ✅ Good Collaboration Practices

#### 3. 명확한 주석

**좋은 점**:
- CTO 주석으로 의도 명확화
- 코드 변경 이유 문서화

#### 4. 에러 처리 일관성

**좋은 점**:
- 에러 코드 사용으로 에러 타입 명확화
- 에러 처리 패턴 일관성 유지

---

## 개선 권장 사항

### P0 - Critical (즉시 개선)

#### 1. HTML 템플릿 함수 분리

**현재**:
```javascript
nodeDetail.innerHTML = `
  <div class="error-message-inline">
    ...
  </div>
`;
```

**개선안**:
```javascript
function renderEgoGraphError(errorType, errorMessage, nodeId) {
  const errorMessages = {
    NOT_FOUND: "해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.",
    UNKNOWN: errorMessage || "알 수 없는 오류가 발생했습니다.",
  };
  
  return `
    <div class="error-message-inline">
      <div class="error-icon-small">⚠️</div>
      <div class="error-content">
        <p class="error-title">지배구조 맵을 불러올 수 없습니다</p>
        <p class="error-detail">${esc(errorMessages[errorType] || errorMessages.UNKNOWN)}</p>
        <button class="btn-retry" data-action="retry-ego-graph" data-node-id="${esc(nodeId)}">다시 시도</button>
      </div>
    </div>
  `;
}

// 사용
const nodeDetail = document.getElementById("nodeDetail");
if (nodeDetail) {
  nodeDetail.innerHTML = renderEgoGraphError("NOT_FOUND", null, targetNodeId);
}
```

#### 2. 이벤트 리스너 개선

**현재**:
```javascript
<button class="btn-retry" onclick="loadEgoGraph('${targetNodeId}')">다시 시도</button>
```

**개선안**:
```javascript
// 이벤트 위임 패턴 사용
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-retry")) {
    const nodeId = e.target.dataset.nodeId;
    if (nodeId && e.target.dataset.action === "retry-ego-graph") {
      loadEgoGraph(nodeId);
    }
  }
});

// HTML
<button class="btn-retry" data-action="retry-ego-graph" data-node-id="${esc(nodeId)}">다시 시도</button>
```

#### 3. API 파라미터 상수화

**현재**:
```javascript
const res = await apiCall(
  `/api/v1/graph/ego?node_id=${encodeURIComponent(targetNodeId)}&max_hops=2&max_nodes=120`,
);
```

**개선안**:
```javascript
const EGO_GRAPH_CONFIG = {
  MAX_HOPS: 2,
  MAX_NODES: 120,
};

const res = await apiCall(
  `/api/v1/graph/ego?node_id=${encodeURIComponent(targetNodeId)}&max_hops=${EGO_GRAPH_CONFIG.MAX_HOPS}&max_nodes=${EGO_GRAPH_CONFIG.MAX_NODES}`,
);
```

### P1 - High (단기 개선)

#### 4. 에러 메시지 상수화

**개선안**:
```javascript
const ERROR_MESSAGES = {
  EGO_GRAPH_LOAD_FAILED: "지배구조 맵을 불러올 수 없습니다",
  EGO_GRAPH_NODE_NOT_FOUND: "해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.",
  EGO_GRAPH_DATA_MISSING: "지배구조 맵 데이터 없음",
  EGO_GRAPH_DATA_ERROR: "지배구조 맵 데이터 오류",
  EGO_GRAPH_NO_NODES: "지배구조 맵 노드 없음",
};
```

#### 5. 사이드 이펙트 최소화

**개선안**:
```javascript
// nodeDetail.innerHTML 직접 조작 대신 기존 함수 활용
function showEgoGraphError(errorType, errorMessage, nodeId) {
  const nodeDetail = document.getElementById("nodeDetail");
  if (!nodeDetail) return;
  
  // 기존 내용 백업 (필요 시)
  const originalContent = nodeDetail.innerHTML;
  
  // 에러 메시지 표시
  nodeDetail.innerHTML = renderEgoGraphError(errorType, errorMessage, nodeId);
  
  // 이벤트 리스너 재등록 (필요 시)
  setupEgoGraphErrorListeners(nodeId);
}
```

### P2 - Medium (중기 개선)

#### 6. 템플릿 엔진 도입

**개선안**:
- 간단한 템플릿 함수 라이브러리 사용
- 또는 컴포넌트 시스템 도입 고려

#### 7. 다국어 지원

**개선안**:
- i18n 라이브러리 도입
- 메시지 리소스 파일 분리

---

## 결론

### 현재 상태 요약

**강점**:
- ✅ 에러 처리 개선 (`alert()` 제거)
- ✅ 데이터 검증 강화
- ✅ 에러 코드 사용
- ✅ XSS 방지 (`esc()` 사용)

**개선 필요 영역**:
- ⚠️ HTML 템플릿 하드코딩
- ⚠️ API 파라미터 하드코딩
- ⚠️ 에러 메시지 하드코딩
- ⚠️ 인라인 이벤트 핸들러
- ⚠️ 사이드 이펙트 가능성

### 권장 사항

1. **즉시 개선 (P0)**: HTML 템플릿 함수 분리, 이벤트 리스너 개선, API 파라미터 상수화
2. **단기 개선 (P1)**: 에러 메시지 상수화, 사이드 이펙트 최소화
3. **중기 개선 (P2)**: 템플릿 엔진 도입, 다국어 지원

---

## 관련 파일

### 프론트엔드
- `frontend/graph.js`: `loadEgoGraph()` 함수 (라인 407-527)
- `frontend/graph.css`: 인라인 에러 메시지 스타일 (라인 2206-2250)

### 문서
- `docs/CTO-GOVERNANCE-MAP-FIX.md`: 수정 사항 문서
- `docs/CTO-GOVERNANCE-MAP-CODE-REVIEW.md`: 본 문서
