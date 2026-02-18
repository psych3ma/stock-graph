# 채팅 및 그래프 레이아웃 수정 완료

## 수정 사항

### ✅ 1. 한글 입력 자동완성 버그 수정
- **문제**: "사례" 입력 후 Enter 시 "례"만 남아서 별도 메시지로 전송
- **원인**: IME(Input Method Editor) composition 상태 미확인
- **해결**:
  - `compositionstart` / `compositionend` 이벤트 리스너 추가
  - `isComposing` 플래그로 composition 상태 추적
  - composition 중에는 Enter 키 무시
- **결과**: 한글 입력 완료 후에만 메시지 전송

### ✅ 2. LLM/DB 답변 중복 표시 방지
- **문제**: DB 조회 실패 → LLM 추론 시도 시 둘 다 화면에 표시
- **원인**: 
  - 백엔드에서 에러 발생 시에도 answer 반환
  - 프론트에서 중복 호출 가능성
- **해결**:
  - `isSending` 플래그로 중복 전송 방지
  - `responseAdded` 플래그로 중복 응답 방지
  - 백엔드 에러 시 즉시 return (대화 이력에 추가 안 함)
  - Context length exceeded 에러 명확히 구분
- **결과**: 한 번만 응답 표시, 에러 메시지 명확화

### ✅ 3. 노드 개수 제한 해제 + 넓게 퍼지기
- **문제**: 노드 겹침 방지를 위해 limit=15로 줄임
- **사용자 요구**: 모든 노드를 보되 넓게 퍼지길 원함
- **해결**:
  - 초기 로드: 15 → **50 nodes** (원래대로)
  - Force-directed 반복: 80 → **150회**
  - 최소 거리: 100px → **120px**
  - 반발력 범위: minDist → **minDist * 1.5배**
  - 반발력 강도: 2.0 → **3.0**
  - 이상적 거리: 200px → **250px**
  - 인력 강도: 0.15 → **0.2**
  - 패딩: 80px → **100px** (레이아웃), **120px** (fitToView)
- **결과**: 모든 노드가 로드되고 넓게 퍼짐

## 기술적 개선

### 한글 입력 처리
```javascript
// Before: composition 상태 미확인
if (e.key==='Enter' && !e.shiftKey) { ... }

// After: composition 상태 확인
let isComposing = false;
addEventListener('compositionstart', () => isComposing = true);
addEventListener('compositionend', () => isComposing = false);
if (e.key==='Enter' && !e.shiftKey && !isComposing) { ... }
```

### 중복 방지
```javascript
// Before: 중복 호출 가능
sendMessage(v);

// After: 플래그로 중복 방지
let isSending = false;
if (isSending) return;
isSending = true;
sendMessage(v).finally(() => isSending = false);
```

### 그래프 레이아웃 강화
- 반발력 범위 확대: `dist < minDist` → `dist < minDist * 1.5`
- 반발력 강도 증가: `force * 2.0` → `force * 3.0`
- 이상적 거리 증가: `200px` → `250px`
- 반복 횟수 증가: `80회` → `150회`
