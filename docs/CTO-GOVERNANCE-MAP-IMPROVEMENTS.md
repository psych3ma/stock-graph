# CTO: 지배구조 맵 보기 기능 개선 완료

**작업 일자**: 2026-02-19  
**작업 범위**: 하드코딩 제거 및 사이드 이펙트 최소화  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 적용된 개선 사항

### 1. 하드코딩 제거

#### ✅ API 파라미터 상수화

**변경 전**:
```javascript
const res = await apiCall(
  `/api/v1/graph/ego?node_id=${encodeURIComponent(targetNodeId)}&max_hops=2&max_nodes=120`,
);
```

**변경 후**:
```javascript
const EGO_GRAPH_CONFIG = {
  MAX_HOPS: 2,
  MAX_NODES: 120,
};

const res = await apiCall(
  `/api/v1/graph/ego?node_id=${encodeURIComponent(targetNodeId)}&max_hops=${EGO_GRAPH_CONFIG.MAX_HOPS}&max_nodes=${EGO_GRAPH_CONFIG.MAX_NODES}`,
);
```

**개선 효과**:
- 하드코딩 제거
- 설정 변경 용이
- 의미 명확화

#### ✅ 에러 메시지 상수화

**변경 전**:
```javascript
updateStatus("지배구조 맵 데이터 없음", false);
updateStatus("지배구조 맵 데이터 오류", false);
updateStatus("지배구조 맵 노드 없음", false);
updateStatus("지배구조 맵 로드 실패", false, ERROR_CODES.NEO4J_CONNECTION_FAILED);
```

**변경 후**:
```javascript
const ERROR_MESSAGES = {
  EGO_GRAPH_LOAD_FAILED: "지배구조 맵을 불러올 수 없습니다",
  EGO_GRAPH_NODE_NOT_FOUND: "해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.",
  EGO_GRAPH_DATA_MISSING: "지배구조 맵 데이터 없음",
  EGO_GRAPH_DATA_ERROR: "지배구조 맵 데이터 오류",
  EGO_GRAPH_NO_NODES: "지배구조 맵 노드 없음",
  EGO_GRAPH_LOAD_FAILED_STATUS: "지배구조 맵 로드 실패",
};

updateStatus(ERROR_MESSAGES.EGO_GRAPH_DATA_MISSING, false);
updateStatus(ERROR_MESSAGES.EGO_GRAPH_DATA_ERROR, false);
updateStatus(ERROR_MESSAGES.EGO_GRAPH_NO_NODES, false);
updateStatus(ERROR_MESSAGES.EGO_GRAPH_LOAD_FAILED_STATUS, false, ERROR_CODES.NEO4J_CONNECTION_FAILED);
```

**개선 효과**:
- 하드코딩 제거
- 메시지 중앙 관리
- 다국어 지원 준비

#### ✅ HTML 템플릿 함수 분리

**변경 전**:
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

**변경 후**:
```javascript
function renderEgoGraphError(errorType, errorMessage, nodeId) {
  const errorDetails = {
    NOT_FOUND: ERROR_MESSAGES.EGO_GRAPH_NODE_NOT_FOUND,
    UNKNOWN: errorMessage || "알 수 없는 오류가 발생했습니다.",
  };
  
  const detailText = esc(errorDetails[errorType] || errorDetails.UNKNOWN);
  const safeNodeId = esc(nodeId);
  
  return `
    <div class="error-message-inline">
      <div class="error-icon-small">⚠️</div>
      <div class="error-content">
        <p class="error-title">${esc(ERROR_MESSAGES.EGO_GRAPH_LOAD_FAILED)}</p>
        <p class="error-detail">${detailText}</p>
        <button class="btn-retry" data-action="retry-ego-graph" data-node-id="${safeNodeId}">다시 시도</button>
      </div>
    </div>
  `;
}

function showEgoGraphError(errorType, errorMessage, nodeId) {
  const nodeDetail = document.getElementById("nodeDetail");
  if (!nodeDetail) return;
  nodeDetail.innerHTML = renderEgoGraphError(errorType, errorMessage, nodeId);
}
```

**개선 효과**:
- HTML 템플릿 중복 제거
- 재사용 가능한 함수
- 유지보수성 향상

#### ✅ 인라인 이벤트 핸들러 제거

**변경 전**:
```javascript
<button class="btn-retry" onclick="loadEgoGraph('${targetNodeId}')">다시 시도</button>
```

**변경 후**:
```javascript
// 전역 이벤트 위임
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-retry") && e.target.dataset.action === "retry-ego-graph") {
    const nodeId = e.target.dataset.nodeId;
    if (nodeId) {
      e.preventDefault();
      loadEgoGraph(nodeId);
    }
  }
});

// HTML
<button class="btn-retry" data-action="retry-ego-graph" data-node-id="${safeNodeId}">다시 시도</button>
```

**개선 효과**:
- 인라인 이벤트 핸들러 제거
- 이벤트 위임 패턴 적용
- 이벤트 리스너 관리 용이

---

## 사이드 이펙트 분석 및 완화

### 1. `nodeDetail.innerHTML` 직접 조작

**문제점**:
- 기존 이벤트 리스너 손실 가능성
- `renderNodeDetail()` 또는 `renderNodeDetailFallback()`에서 설정한 이벤트 리스너 제거

**완화 조치**:
- 에러 상태는 명시적으로 `nodeDetail`을 완전히 대체
- 정상 상태에서는 `renderNodeDetail()` 또는 `renderNodeDetailFallback()` 사용
- 에러 상태와 정상 상태가 명확히 구분됨

**검증**:
- `renderNodeDetail()` 및 `renderNodeDetailFallback()`에서 `innerHTML` 사용 확인
- 에러 상태에서는 기존 내용을 완전히 대체하는 것이 의도된 동작

### 2. 전역 상태 변경 (`NODES`, `EDGES`)

**문제점**:
- 전역 `NODES`, `EDGES` 변수를 완전히 덮어씀
- 기존 그래프 데이터 손실

**완화 조치**:
- `isEgoMode` 플래그로 보호됨
- `exitEgoMode()`에서 `loadGraph()` 호출로 원래 상태 복원
- Ego 모드와 일반 모드가 명확히 구분됨

**검증**:
- `isEgoMode`를 확인하는 모든 함수 확인
- `exitEgoMode()`에서 원래 상태 복원 확인

### 3. `selectedNode` 상태 변경

**문제점**:
- 전역 `selectedNode` 변수 변경
- 다른 함수가 `selectedNode`를 참조하는 경우 예상치 못한 동작 가능

**완화 조치**:
- `selectedNode`는 Ego 그래프의 중심 노드로 설정되는 것이 의도된 동작
- `renderNodeDetail()` 호출로 노드 상세 정보 표시
- 정상적인 플로우의 일부

**검증**:
- `selectedNode` 변경이 다른 함수에 영향을 주는지 확인
- Ego 모드에서 `selectedNode` 사용이 의도된 동작인지 확인

---

## 호환성 검토

### ✅ Backward Compatibility

**확인 사항**:
- 기존 API 엔드포인트 사용 (`/api/v1/graph/ego`)
- 기존 함수 시그니처 유지 (`loadEgoGraph(nodeId)`)
- 기존 CSS 클래스명 사용 (새로운 클래스 추가만)

**결과**: ✅ 호환성 유지

### ✅ Browser Compatibility

**확인 사항**:
- 표준 DOM API 사용 (`getElementById`, `innerHTML`)
- `template literals` 사용 (ES6, 모든 모던 브라우저 지원)
- `async/await` 사용 (ES2017, 모든 모던 브라우저 지원)
- `addEventListener` 사용 (표준 API)

**결과**: ✅ 브라우저 호환성 유지

---

## 일관성 검토

### ✅ 에러 처리 패턴 통일

**개선 사항**:
- `showEgoGraphError()` 함수로 에러 처리 통일
- `renderEgoGraphError()` 함수로 HTML 생성 통일
- 에러 메시지 상수화로 일관성 유지

**결과**: ✅ 일관성 향상

### ✅ HTML 생성 방식 통일

**개선 사항**:
- 템플릿 함수로 HTML 생성 통일
- `esc()` 함수로 XSS 방지 일관성 유지

**결과**: ✅ 일관성 향상

---

## 유지보수성 검토

### ✅ 코드 중복 제거

**개선 사항**:
- HTML 템플릿 함수 분리로 중복 제거
- 에러 메시지 상수화로 중복 제거
- API 파라미터 상수화로 중복 제거

**결과**: ✅ 유지보수성 향상

### ✅ 함수 분리

**개선 사항**:
- `renderEgoGraphError()`: HTML 템플릿 생성
- `showEgoGraphError()`: 에러 표시 로직
- 명확한 책임 분리

**결과**: ✅ 유지보수성 향상

---

## 확장성 검토

### ✅ 설정 상수화

**개선 사항**:
- `EGO_GRAPH_CONFIG`로 설정 중앙 관리
- `ERROR_MESSAGES`로 메시지 중앙 관리
- 다국어 지원 준비

**결과**: ✅ 확장성 향상

### ✅ 템플릿 함수 분리

**개선 사항**:
- `renderEgoGraphError()` 함수로 템플릿 재사용 가능
- 다른 에러 타입 추가 시 함수 재사용 가능

**결과**: ✅ 확장성 향상

---

## 협업 코드 검토

### ✅ HTML/CSS/JS 분리

**개선 사항**:
- HTML 템플릿을 함수로 분리
- CSS 클래스명은 하드코딩되지만 CSS 파일과 일치 (필요한 결합)
- 이벤트 핸들러를 전역 이벤트 위임으로 분리

**결과**: ✅ 협업 코드 품질 향상

### ✅ 명확한 주석

**개선 사항**:
- CTO 주석으로 의도 명확화
- 함수명으로 역할 명확화

**결과**: ✅ 협업 코드 품질 향상

---

## 📊 개선 효과 요약

### 하드코딩 제거

**Before**:
- API 파라미터 하드코딩 (`max_hops=2`, `max_nodes=120`)
- 에러 메시지 하드코딩 (여러 곳에 중복)
- HTML 템플릿 하드코딩 (코드에 직접 포함)
- 인라인 이벤트 핸들러 (`onclick`)

**After**:
- ✅ API 파라미터 상수화 (`EGO_GRAPH_CONFIG`)
- ✅ 에러 메시지 상수화 (`ERROR_MESSAGES`)
- ✅ HTML 템플릿 함수 분리 (`renderEgoGraphError()`)
- ✅ 이벤트 위임 패턴 (`addEventListener`)

### 사이드 이펙트 최소화

**Before**:
- `nodeDetail.innerHTML` 직접 조작으로 인한 이벤트 리스너 손실 가능성
- 전역 상태 변경으로 인한 예상치 못한 동작 가능성

**After**:
- ✅ 에러 상태와 정상 상태 명확히 구분
- ✅ `isEgoMode` 플래그로 상태 보호
- ✅ `exitEgoMode()`로 원래 상태 복원

### 코드 품질 향상

**Before**:
- 코드 중복
- 하드코딩
- 인라인 이벤트 핸들러

**After**:
- ✅ 코드 중복 제거
- ✅ 상수화로 하드코딩 제거
- ✅ 이벤트 위임 패턴 적용

---

## 🔍 변경된 파일

### 프론트엔드
- `frontend/graph.js`:
  - `EGO_GRAPH_CONFIG` 상수 추가
  - `ERROR_MESSAGES` 상수 추가
  - `renderEgoGraphError()` 함수 추가
  - `showEgoGraphError()` 함수 추가
  - `loadEgoGraph()` 함수 개선 (하드코딩 제거, 함수 호출)
  - 전역 이벤트 위임 추가

### 문서
- `docs/CTO-GOVERNANCE-MAP-CODE-REVIEW.md`: 초기 검토 문서
- `docs/CTO-GOVERNANCE-MAP-IMPROVEMENTS.md`: 본 문서

---

## ✅ 테스트 체크리스트

- [ ] 하드코딩 제거 확인 (상수 사용)
- [ ] HTML 템플릿 함수 정상 작동 확인
- [ ] 이벤트 위임 패턴 정상 작동 확인
- [ ] 에러 메시지 상수화 확인
- [ ] 사이드 이펙트 없음 확인 (기존 기능 정상 작동)
- [ ] 브라우저 호환성 확인

---

## 관련 문서

- `docs/CTO-GOVERNANCE-MAP-FIX.md`: 초기 수정 사항 문서
- `docs/CTO-GOVERNANCE-MAP-CODE-REVIEW.md`: 코드 검토 문서
- `docs/CTO-GOVERNANCE-MAP-IMPROVEMENTS.md`: 본 문서
