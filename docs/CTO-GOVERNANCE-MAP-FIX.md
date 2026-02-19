# CTO: 지배구조 맵 보기 기능 수정

**작업 일자**: 2026-02-19  
**문제**: '지배구조 맵 보기' 기능이 정상 작동하지 않음  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 발견된 문제점

### 1. 에러 처리 개선 필요

**문제**:
- `alert()` 사용으로 인한 UX 일관성 부족
- 백엔드 연결 실패와 Ego 그래프 실패 구분 부족
- 에러 메시지가 노드 상세 패널에 표시되지 않음

**해결**:
- `alert()` 제거, 인라인 에러 메시지로 변경
- 에러 타입별 맞춤 처리
- 노드 상세 패널에 에러 메시지 표시

### 2. 데이터 검증 부족

**문제**:
- `res.ego_id` 존재 여부 확인 없음
- `ego_id`가 NODES에 존재하는지 확인 없음
- 데이터 없을 때 적절한 폴백 처리 없음

**해결**:
- `ego_id` 검증 추가
- `ego_id`가 NODES에 존재하는지 확인
- 폴백 로직 추가 (첫 번째 노드 사용)

### 3. 에러 메시지 일관성

**문제**:
- "Ego 그래프" 용어 사용 (일관성 부족)
- 에러 코드 미사용

**해결**:
- "지배구조 맵" 용어로 통일
- 에러 코드 사용 (`ERROR_CODES.NEO4J_CONNECTION_FAILED`)

---

## 🔧 적용된 수정 사항

### 1. 에러 처리 개선

**변경 전**:
```javascript
catch (e) {
  // ...
  if (e.message && e.message.includes("404")) {
    alert("해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.");
  } else {
    showConnectionError(e);
  }
}
```

**변경 후**:
```javascript
catch (e) {
  // ...
  const errorType = classifyError(e);
  const errorMessage = e.message || "알 수 없는 오류가 발생했습니다";
  
  if (errorType === ERROR_CODES.NETWORK_ERROR || errorType === ERROR_CODES.BACKEND_CONNECTION_FAILED) {
    showConnectionError(e);
  } else if (errorMessage.includes("404") || errorMessage.includes("찾을 수 없")) {
    // 노드 상세 패널에 인라인 메시지 표시
    const nodeDetail = document.getElementById("nodeDetail");
    if (nodeDetail) {
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
    }
  } else {
    // 기타 에러 처리
  }
}
```

### 2. 데이터 검증 추가

**변경 전**:
```javascript
if (!res || !res.nodes || !res.edges) {
  updateStatus("Ego 그래프 데이터 없음", false);
  hideGraphLoading();
  isEgoMode = false;
  return;
}
NODES = res.nodes;
EDGES = res.edges;
positions = {};
computeHierarchicalLayout(res.ego_id);
```

**변경 후**:
```javascript
if (!res || !res.nodes || !res.edges) {
  updateStatus("지배구조 맵 데이터 없음", false);
  hideGraphLoading();
  isEgoMode = false;
  return;
}

// CTO: ego_id 검증 추가
if (!res.ego_id) {
  console.error("Ego graph response missing ego_id:", res);
  updateStatus("지배구조 맵 데이터 오류", false);
  hideGraphLoading();
  isEgoMode = false;
  return;
}

NODES = res.nodes;
EDGES = res.edges;
positions = {};

// CTO: ego_id가 NODES에 존재하는지 확인
const egoNode = NODES.find((n) => n.id === res.ego_id);
if (!egoNode) {
  console.warn("Ego node not found in nodes, using first node as fallback:", res.ego_id);
  // 폴백: 첫 번째 노드를 중심으로 사용
  if (NODES.length > 0) {
    computeHierarchicalLayout(NODES[0].id);
  } else {
    updateStatus("지배구조 맵 노드 없음", false);
    hideGraphLoading();
    isEgoMode = false;
    return;
  }
} else {
  computeHierarchicalLayout(res.ego_id);
}
```

### 3. CSS 스타일 추가

**추가된 CSS** (`frontend/graph.css`):
```css
.error-message-inline {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--surface-error);
  border: 1px solid var(--border-error);
  border-radius: var(--r);
  margin: 16px;
}
.error-icon-small {
  font-size: 24px;
  flex-shrink: 0;
}
.error-content .error-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 6px;
}
.error-content .error-detail {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.5;
  margin-bottom: 12px;
}
.btn-retry {
  padding: 8px 16px;
  background: var(--pwc-orange);
  color: #fff;
  border: none;
  border-radius: var(--r);
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.15s;
}
.btn-retry:hover {
  background: #c24d03;
}
```

### 4. 용어 통일

**변경 사항**:
- "Ego 그래프" → "지배구조 맵" (사용자 친화적 용어)
- 에러 메시지 일관성 향상

---

## 📊 개선 효과

### 사용자 경험 (UX)

**Before**:
- `alert()` 팝업으로 인한 방해
- 에러 원인 파악 어려움
- 재시도 불편

**After**:
- 인라인 에러 메시지로 자연스러운 피드백
- 명확한 에러 메시지 및 재시도 버튼
- 노드 상세 패널에서 바로 확인 가능

### 시스템 안정성

**Before**:
- 데이터 검증 부족
- `ego_id` 누락 시 크래시 가능성
- 폴백 처리 없음

**After**:
- 데이터 검증 강화
- `ego_id` 누락 시 적절한 처리
- 폴백 로직으로 안정성 향상

### 코드 품질

**Before**:
- 에러 처리 일관성 부족
- 용어 불일치
- 에러 코드 미사용

**After**:
- 일관된 에러 처리 패턴
- 용어 통일
- 에러 코드 활용

---

## 🔍 변경된 파일

### 프론트엔드
- `frontend/graph.js`:
  - `loadEgoGraph()` 함수 개선 (에러 처리, 데이터 검증)
  - `nodeId` 변수명을 `targetNodeId`로 변경 (클로저 문제 해결)
- `frontend/graph.css`:
  - 인라인 에러 메시지 스타일 추가

---

## ✅ 테스트 체크리스트

- [ ] 정상 케이스: 지배구조 맵이 정상적으로 로드되는지 확인
- [ ] 404 에러: 노드를 찾을 수 없을 때 인라인 메시지가 표시되는지 확인
- [ ] 네트워크 에러: 백엔드 연결 실패 시 적절한 에러 메시지가 표시되는지 확인
- [ ] 데이터 검증: `ego_id` 누락 시 적절한 처리되는지 확인
- [ ] 폴백 로직: `ego_id`가 NODES에 없을 때 첫 번째 노드를 사용하는지 확인
- [ ] 재시도 버튼: 재시도 버튼이 정상 작동하는지 확인
- [ ] 용어 일관성: "지배구조 맵" 용어가 일관되게 사용되는지 확인

---

## 관련 문서

- `docs/CTO-GOVERNANCE-MAP-ERROR-REVIEW.md`: 초기 검토 문서
- `docs/CTO-ERROR-MESSAGE-IMPROVEMENTS.md`: 에러 메시지 개선 문서
- `docs/CTO-GOVERNANCE-MAP-FIX.md`: 본 문서
