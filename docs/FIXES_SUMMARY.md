# CTO 관점 수정 사항 요약

**수정 일자**: 2026-02-17  
**수정 범위**: Critical 및 High Priority 이슈 7개

---

## 수정 완료 이슈 현황표

| ID | 이슈 | 현황 | 원인 | 해결책 | 파일 |
|---|---|---|---|---|---|
| **QA-002** | API 타임아웃 처리 없음 | ✅ 수정 완료 | `fetch()`에 타임아웃 설정 없어 네트워크 지연 시 무한 대기 | `AbortController`와 `setTimeout`으로 30초 타임아웃 구현, 타임아웃 시 사용자 친화적 에러 메시지 표시 | `frontend/graph.html:649-667` |
| **QA-003** | 입력 검증 부족 (XSS 취약점) | ✅ 수정 완료 | 사용자 입력이 HTML로 렌더링될 때 XSS 공격 가능, 백엔드 검증 부족 | 백엔드에 `_sanitize_search()`, `_sanitize_question()` 함수 추가하여 `html.escape()`로 태그 제거 및 길이 제한 (100자/500자) | `backend/app/api/v1/endpoints/graph.py:28-35`, `backend/app/api/v1/endpoints/chat.py:9-15` |
| **QA-004** | 빈 레이블 노드 처리 부족 | ✅ 수정 완료 | `n.label.charAt(0)`에서 `n.label`이 `undefined` 또는 빈 문자열일 때 에러 발생 가능 | `(n.label || '?').charAt(0)`로 기본값 처리, `nodeLabel` 변수로 안전하게 처리 | `frontend/graph.html:993, 1006-1020` |
| **QA-001** | 엣지 렌더링 실패 시 사용자 피드백 없음 | ✅ 수정 완료 | 엣지가 표시되지 않아도 콘솔 경고만 출력, 사용자에게 알림 없음 | `missingEdgeCount` 추적하여 실패한 엣지 수를 사용자에게 알림, 5초 후 자동 해제 | `frontend/graph.html:908-920` |
| **QA-005** | 동시성 문제 (Race Condition) | ✅ 수정 완료 | `initPositions()`가 동기 실행되어 완료 전 `fitToView()` 호출 가능, `setTimeout(200ms)`로는 부족 | `initPositions()`를 Promise로 변경, `requestAnimationFrame`으로 force-directed 알고리즘을 분할 실행하여 UI 블로킹 방지, `await`로 완료 보장 | `frontend/graph.html:789-890, 696-702` |
| **QA-008** | 빈 응답 처리 부족 | ✅ 수정 완료 | `nodesRes.nodes || []`로 처리하지만 `nodesRes` 자체가 `null`이면 에러 발생 | 옵셔널 체이닝(`?.`)과 필터링으로 안전하게 처리, `null`/`undefined` 체크 강화 | `frontend/graph.html:687-688` |
| **QA-009** | 중복 요청 방지 없음 | ✅ 수정 완료 | 채팅 전송 버튼 연타 시 동일한 요청이 여러 번 전송되어 중복 응답 표시 | `isSending` 플래그로 중복 요청 방지, `finally` 블록에서 항상 플래그 해제 | `frontend/graph.html:1357-1400` |

---

## 수정 상세

### 1. API 타임아웃 처리 (QA-002)
**변경 전**:
```javascript
const res = await fetch(`${API_BASE}${endpoint}`, {...});
// 타임아웃 없음
```

**변경 후**:
```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);
const res = await fetch(`${API_BASE}${endpoint}`, {
  signal: controller.signal,
  ...
});
```

**효과**: 네트워크 지연 시 30초 후 자동 취소, 사용자에게 명확한 피드백 제공

---

### 2. 입력 검증 강화 (QA-003)
**변경 전**:
```python
search: Optional[str] = Query(None, ...)
# 검증 없음
```

**변경 후**:
```python
def _sanitize_search(search: Optional[str]) -> Optional[str]:
    if not search:
        return None
    import html
    sanitized = html.escape(search.strip())
    if len(sanitized) > 100:
        sanitized = sanitized[:100]
    return sanitized if sanitized else None
```

**효과**: XSS 공격 방지, 입력 길이 제한으로 성능 보호

---

### 3. 빈 레이블 처리 (QA-004)
**변경 전**:
```javascript
const initials = n.label.charAt(0); // 에러 가능
```

**변경 후**:
```javascript
const initials = (n.label || '?').charAt(0);
const nodeLabel = n.label || 'Unknown';
```

**효과**: 빈 레이블 노드도 안전하게 처리, 기본값 표시

---

### 4. 엣지 렌더링 피드백 (QA-001)
**변경 전**:
```javascript
if (!p1 || !p2) {
  console.warn(...);
  return; // 조용히 실패
}
```

**변경 후**:
```javascript
let missingEdgeCount = 0;
if (!p1 || !p2) {
  missingEdgeCount++;
  ...
}
if (missingEdgeCount > 0 && !window.edgeWarningShown) {
  updateStatus(`${missingEdgeCount}개의 관계가 표시되지 않았습니다`, false);
}
```

**효과**: 사용자에게 문제 상황을 명확히 알림

---

### 5. 동시성 문제 해결 (QA-005)
**변경 전**:
```javascript
function initPositions() {
  for (let iter = 0; iter < 300; iter++) {
    // 동기 실행, UI 블로킹
  }
}
initPositions();
setTimeout(() => fitToView(), 200); // 타이밍 보장 안 됨
```

**변경 후**:
```javascript
function initPositions() {
  return new Promise((resolve) => {
    let iter = 0;
    function step() {
      for (let i = 0; i < 10 && iter < 300; i++, iter++) {
        // force 계산
      }
      if (iter < 300) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    step();
  });
}
await initPositions(); // 완료 보장
fitToView();
```

**효과**: 레이아웃 완료 후 fit-to-view 실행 보장, UI 블로킹 방지

---

### 6. 빈 응답 처리 강화 (QA-008)
**변경 전**:
```javascript
NODES = nodesRes.nodes || [];
EDGES = edgesRes.edges || [];
```

**변경 후**:
```javascript
NODES = (nodesRes?.nodes || []).filter(n => n && n.id);
EDGES = (edgesRes?.edges || []).filter(e => e && e.from && e.to);
```

**효과**: `null`/`undefined` 응답 안전 처리, 유효하지 않은 데이터 필터링

---

### 7. 중복 요청 방지 (QA-009)
**변경 전**:
```javascript
async function sendMessage() {
  // 중복 방지 없음
  const data = await sendChatMessage(q);
}
```

**변경 후**:
```javascript
let isSending = false;
if (isSending) return;
isSending = true;
try {
  const data = await sendChatMessage(q);
} finally {
  isSending = false;
}
```

**효과**: 버튼 연타 시 중복 요청 방지, 리소스 절약

---

## 테스트 권장 사항

### 1. 타임아웃 테스트
- 네트워크를 느리게 설정하고 API 호출
- 30초 후 타임아웃 메시지 확인

### 2. XSS 테스트
- 검색어에 `<script>alert('XSS')</script>` 입력
- HTML이 이스케이프되어 표시되는지 확인

### 3. 빈 레이블 테스트
- `label`이 없는 노드 생성
- 기본값('?', 'Unknown')이 표시되는지 확인

### 4. 동시성 테스트
- 페이지 로드 직후 빠르게 줌/패닝 조작
- 레이아웃이 완료된 후 정확히 표시되는지 확인

### 5. 중복 요청 테스트
- 채팅 전송 버튼을 빠르게 여러 번 클릭
- 요청이 한 번만 전송되는지 확인

---

## 향후 개선 사항

다음 스프린트에서 처리할 Medium Priority 이슈:
- QA-010: 접근성 개선 (ARIA 속성 추가)
- QA-011: 로딩 상태 표시 개선
- QA-012: 성능 모니터링 추가
- QA-013: 입력 길이 제한 UI 표시
- QA-014: 상태 유지 (localStorage)

---

**수정 완료**: 2026-02-17  
**검증 필요**: 각 수정 사항별 테스트 수행 권장
