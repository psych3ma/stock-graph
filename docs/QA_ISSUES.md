# QA 전문가 관점 이슈 리스트

**검토 일자**: 2026-02-17  
**검토 대상**: GraphIQ 서비스 (백엔드 + 프론트엔드)  
**검토 기준**: 기능성, 사용성, 안정성, 성능, 보안, 접근성

---

## 🔴 Critical Issues (P0 - 즉시 수정 필요)

### QA-001: 엣지 렌더링 실패 시 사용자 피드백 없음
**위치**: `frontend/graph.html:908-914`  
**심각도**: Critical  
**재현 단계**:
1. 노드가 로드되었지만 positions가 초기화되지 않은 상태
2. 엣지 렌더링 시도
3. 엣지가 표시되지 않음
4. 사용자에게 알림 없음

**현재 동작**:
```javascript
if (!p1 || !p2) {
  console.warn(`Edge ${e.from} -> ${e.to} skipped: missing positions`);
  return; // 조용히 실패
}
```

**문제점**:
- 콘솔에만 경고 출력 (사용자는 모름)
- 엣지가 없어도 정상 작동하는 것처럼 보임
- 디버깅이 어려움

**권장 수정**:
```javascript
if (!p1 || !p2) {
  console.warn(`Edge ${e.from} -> ${e.to} skipped: missing positions`);
  // 사용자에게 알림 표시
  if (!window.edgeWarningShown) {
    updateStatus('일부 관계가 표시되지 않을 수 있습니다', false);
    window.edgeWarningShown = true;
  }
  return;
}
```

---

### QA-002: API 타임아웃 처리 없음
**위치**: `frontend/graph.html:649-667`, `backend/app/api/v1/endpoints/*`  
**심각도**: Critical  
**재현 단계**:
1. 백엔드가 느리게 응답하거나 응답하지 않음
2. 프론트엔드가 무한 대기
3. 사용자가 언제까지 기다려야 하는지 모름

**현재 동작**:
```javascript
const res = await fetch(`${API_BASE}${endpoint}`, {
  ...options,
  headers: { 'Content-Type': 'application/json', ...options.headers },
});
// 타임아웃 없음
```

**문제점**:
- 네트워크 지연 시 무한 대기
- 사용자 경험 저하
- 리소스 낭비

**권장 수정**:
```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃

try {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  clearTimeout(timeoutId);
  // ...
} catch (e) {
  clearTimeout(timeoutId);
  if (e.name === 'AbortError') {
    throw new Error('요청 시간이 초과되었습니다. 다시 시도해주세요.');
  }
  throw e;
}
```

---

### QA-003: 입력 검증 부족 (XSS 취약점 가능성)
**위치**: `frontend/graph.html:993-1002`, `backend/app/api/v1/endpoints/graph.py:32`  
**심각도**: Critical  
**재현 단계**:
1. 검색어에 `<script>alert('XSS')</script>` 입력
2. 백엔드에서 검증 없이 쿼리 실행
3. 프론트엔드에서 HTML로 렌더링 시 XSS 가능

**현재 동작**:
```python
search: Optional[str] = Query(None, description="검색어 (회사명/주주명)")
# 검증 없음
WHERE $search IS NULL OR c.companyName CONTAINS $search
```

**문제점**:
- SQL Injection은 Neo4j 파라미터화로 방지되지만, XSS는 가능
- 사용자 입력이 그대로 렌더링됨

**권장 수정**:
```python
from pydantic import validator
import html

@validator('search')
def validate_search(cls, v):
    if v:
        # HTML 태그 제거
        v = html.escape(v)
        # 특수 문자 제한
        if len(v) > 100:
            raise ValueError('검색어는 100자 이하여야 합니다.')
    return v
```

```javascript
// 프론트엔드에서도 이스케이프
label.textContent = escapeHtml(n.label || 'Unknown');
```

---

### QA-004: 빈 레이블 노드 처리 부족
**위치**: `frontend/graph.html:993`, `backend/app/api/v1/endpoints/graph.py:62`  
**심각도**: Critical  
**재현 단계**:
1. DB에 `companyName`이 NULL인 노드 존재
2. `n.label.charAt(0)`에서 에러 발생 가능

**현재 동작**:
```javascript
const initials = n.label.charAt(0); // n.label이 빈 문자열이면 빈 문자
```

**문제점**:
- `n.label`이 `undefined` 또는 빈 문자열일 때 처리 없음
- 초기값이 표시되지 않음

**권장 수정**:
```javascript
const initials = (n.label || '?').charAt(0);
```

---

## ⚠️ High Priority Issues (P1 - 이번 주 내 수정)

### QA-005: 동시성 문제 (Race Condition)
**위치**: `frontend/graph.html:696-702`  
**심각도**: High  
**재현 단계**:
1. `loadGraph()` 호출
2. `initPositions()` 실행 중 (300회 반복)
3. `setTimeout(200ms)` 후 `fitToView()` 호출
4. `positions`가 아직 완전히 계산되지 않음

**현재 동작**:
```javascript
initPositions(); // 동기 실행, 시간 소요
renderGraph();
setTimeout(() => {
  fitToView(); // positions가 완료되지 않았을 수 있음
  renderGraph();
}, 200);
```

**문제점**:
- `initPositions()`가 300회 반복하므로 200ms로는 부족할 수 있음
- 레이아웃이 완료되기 전에 fit-to-view 실행

**권장 수정**:
```javascript
// initPositions를 Promise로 변경
async function initPositions() {
  return new Promise(resolve => {
    // ... 기존 로직
    // requestAnimationFrame으로 분할 실행
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

// loadGraph에서
await initPositions();
renderGraph();
fitToView();
renderGraph();
```

---

### QA-006: 메모리 누수 가능성
**위치**: `frontend/graph.html:1004-1020`  
**심각도**: High  
**재현 단계**:
1. 노드를 여러 번 클릭
2. 이벤트 리스너가 계속 추가됨
3. 메모리 사용량 증가

**현재 동작**:
```javascript
g.addEventListener('mouseenter', (e) => showTooltip(n, e));
g.addEventListener('mouseleave', hideTooltip);
g.addEventListener('mousedown', (e) => startNodeDrag(n.id, e));
g.addEventListener('click', (e) => { e.stopPropagation(); selectNode(n); });
// renderGraph()가 호출될 때마다 새로 생성됨
```

**문제점**:
- `renderGraph()`가 호출될 때마다 이전 요소가 제거되지만, 이벤트 리스너는 정리되지 않을 수 있음
- `innerHTML = ''`로 제거하면 리스너도 제거되지만, 명시적 정리가 없음

**권장 수정**:
```javascript
// 이벤트 위임 사용
nodeG.addEventListener('mouseenter', (e) => {
  const nodeId = e.target.closest('[data-id]')?.getAttribute('data-id');
  if (nodeId) {
    const node = NODES.find(n => n.id === nodeId);
    if (node) showTooltip(node, e);
  }
});
// 한 번만 등록
```

---

### QA-007: 에러 메시지가 사용자 친화적이지 않음
**위치**: `backend/app/api/v1/endpoints/graph.py:106, 151, 266`  
**심각도**: High  
**재현 단계**:
1. Neo4j 연결 실패
2. 에러 메시지: "노드 조회 실패: Connection refused"
3. 사용자가 이해하기 어려움

**현재 동작**:
```python
except Exception as e:
    raise HTTPException(500, f"노드 조회 실패: {str(e)}")
```

**문제점**:
- 기술적 에러 메시지가 그대로 노출
- 사용자 친화적이지 않음

**권장 수정**:
```python
except ConnectionError as e:
    raise HTTPException(503, "데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.")
except Exception as e:
    logger.error(f"노드 조회 실패: {e}", exc_info=True)
    raise HTTPException(500, "데이터를 불러오는 중 오류가 발생했습니다.")
```

---

### QA-008: 빈 응답 처리 부족
**위치**: `frontend/graph.html:687-688`  
**심각도**: High  
**재현 단계**:
1. API가 `{"nodes": null}` 반환
2. `nodesRes.nodes || []`로 처리하지만, `null` 체크만 함
3. `nodesRes` 자체가 `null`이면 에러

**현재 동작**:
```javascript
NODES = nodesRes.nodes || [];
EDGES = edgesRes.edges || [];
```

**문제점**:
- `nodesRes`가 `null`이면 에러 발생
- 예상치 못한 응답 형식 처리 없음

**권장 수정**:
```javascript
NODES = (nodesRes?.nodes || []).filter(n => n && n.id);
EDGES = (edgesRes?.edges || []).filter(e => e && e.from && e.to);
```

---

### QA-009: 중복 요청 방지 없음
**위치**: `frontend/graph.html:764-777`  
**심각도**: High  
**재현 단계**:
1. 사용자가 채팅 전송 버튼을 빠르게 여러 번 클릭
2. 동일한 요청이 여러 번 전송됨
3. 중복 응답 표시

**현재 동작**:
```javascript
async function sendMessage() {
  // 중복 방지 없음
  const question = input.value.trim();
  // ...
}
```

**문제점**:
- `isSending` 플래그가 있지만 완전하지 않음
- 네트워크 지연 시 중복 요청 가능

**권장 수정**:
```javascript
let isSending = false;

async function sendMessage() {
  if (isSending) {
    console.warn('이미 요청 중입니다.');
    return;
  }
  isSending = true;
  try {
    // ... 요청 로직
  } finally {
    isSending = false;
  }
}
```

---

## 📊 Medium Priority Issues (P2 - 다음 스프린트)

### QA-010: 접근성 부족 (ARIA 속성 없음)
**위치**: `frontend/graph.html:967-1007`  
**심각도**: Medium  
**문제점**:
- SVG 요소에 ARIA 속성 없음
- 키보드 네비게이션 불가
- 스크린 리더 지원 없음

**권장 수정**:
```javascript
g.setAttribute('role', 'button');
g.setAttribute('aria-label', `${n.label} (${n.type})`);
g.setAttribute('tabindex', '0');
```

---

### QA-011: 로딩 상태 표시 부족
**위치**: `frontend/graph.html:696-702`  
**심각도**: Medium  
**문제점**:
- `initPositions()` 실행 중 로딩 표시 없음
- 사용자가 대기 중인지 모름

**권장 수정**:
```javascript
updateStatus('레이아웃 계산 중...', false);
await initPositions();
updateStatus('렌더링 중...', false);
renderGraph();
```

---

### QA-012: 성능 모니터링 없음
**위치**: 전체  
**심각도**: Medium  
**문제점**:
- API 응답 시간 측정 없음
- 렌더링 성능 측정 없음
- 병목 지점 파악 불가

**권장 수정**:
```javascript
const startTime = performance.now();
await apiCall('/api/v1/graph/nodes');
const duration = performance.now() - startTime;
console.log(`API 호출 시간: ${duration}ms`);
// 또는 성능 API 사용
```

---

### QA-013: 입력 길이 제한 없음
**위치**: `frontend/graph.html:427-429`, `backend/app/api/v1/endpoints/chat.py:11`  
**심각도**: Medium  
**문제점**:
- 채팅 입력에 길이 제한 없음
- 매우 긴 텍스트 입력 시 성능 저하 가능

**권장 수정**:
```javascript
<input maxlength="500" ... />
```

```python
@validator('question')
def validate_question(cls, v):
    if len(v) > 500:
        raise ValueError('질문은 500자 이하여야 합니다.')
    return v
```

---

### QA-014: 페이지 새로고침 시 상태 유지 안 됨
**위치**: 전체  
**심각도**: Medium  
**문제점**:
- 선택된 노드, 줌 레벨 등이 저장되지 않음
- 사용자가 다시 설정해야 함

**권장 수정**:
```javascript
// localStorage 사용
localStorage.setItem('graphZoom', zoom);
localStorage.setItem('graphPan', JSON.stringify(pan));
```

---

### QA-015: 모바일 반응형 부족
**위치**: `frontend/graph.html:5`  
**심각도**: Medium  
**문제점**:
- `viewport` 메타 태그는 있지만 실제 반응형 CSS 없음
- 모바일에서 사용하기 어려움

**권장 수정**:
```css
@media (max-width: 768px) {
  .side-panel { width: 100%; }
  .graph-area { height: 50vh; }
}
```

---

## 🔵 Low Priority Issues (P3 - 향후 개선)

### QA-016: 테스트 코드 부족
**위치**: 전체  
**심각도**: Low  
**문제점**:
- 프론트엔드 테스트 없음
- 백엔드 테스트 최소한만 존재

**권장 수정**:
- Jest/Vitest로 프론트엔드 테스트 추가
- E2E 테스트 (Playwright/Cypress) 추가

---

### QA-017: 로깅 부족
**위치**: 전체  
**심각도**: Low  
**문제점**:
- 구조화된 로깅 없음
- 디버깅이 어려움

**권장 수정**:
- 구조화된 로깅 라이브러리 사용 (Winston, Pino 등)
- 로그 레벨 관리

---

### QA-018: 문서화 부족
**위치**: 전체  
**심각도**: Low  
**문제점**:
- API 문서는 FastAPI 자동 생성이지만 사용자 가이드 없음
- 코드 주석 부족

**권장 수정**:
- 사용자 가이드 작성
- 코드 주석 보강

---

## 📋 테스트 시나리오 체크리스트

### 기능 테스트
- [ ] 노드 로드 및 표시
- [ ] 엣지 로드 및 표시
- [ ] 노드 클릭 및 상세 정보 표시
- [ ] 검색 기능
- [ ] 필터 기능
- [ ] 채팅 기능
- [ ] 줌/패닝 기능

### 에러 핸들링 테스트
- [ ] 백엔드 연결 실패
- [ ] 네트워크 타임아웃
- [ ] 잘못된 입력
- [ ] 빈 응답
- [ ] 부분 실패

### 성능 테스트
- [ ] 대량 노드 로드 (500개+)
- [ ] 대량 엣지 로드 (1000개+)
- [ ] 렌더링 성능
- [ ] 메모리 사용량

### 사용성 테스트
- [ ] 키보드 네비게이션
- [ ] 모바일 사용
- [ ] 접근성 (스크린 리더)
- [ ] 로딩 상태 표시

### 보안 테스트
- [ ] XSS 공격
- [ ] SQL Injection (Neo4j 쿼리)
- [ ] CORS 정책
- [ ] 입력 검증

---

## 🎯 우선순위별 액션 아이템

### 즉시 수정 (이번 주)
1. QA-001: 엣지 렌더링 실패 피드백
2. QA-002: API 타임아웃 처리
3. QA-003: 입력 검증 강화
4. QA-004: 빈 레이블 처리

### 이번 주 내
5. QA-005: 동시성 문제 해결
6. QA-006: 메모리 누수 방지
7. QA-007: 사용자 친화적 에러 메시지
8. QA-008: 빈 응답 처리
9. QA-009: 중복 요청 방지

### 다음 스프린트
10. QA-010: 접근성 개선
11. QA-011: 로딩 상태 표시
12. QA-012: 성능 모니터링
13. QA-013: 입력 길이 제한
14. QA-014: 상태 유지

---

**검토 완료**: 2026-02-17  
**다음 리뷰 예정**: 수정 사항 적용 후 재검토
