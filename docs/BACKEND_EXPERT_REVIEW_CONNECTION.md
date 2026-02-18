# 백엔드 전문가 관점: 연결 실패 오류 검토

## 원인

프론트엔드가 **"Backend 연결 실패"**를 띄우는 경우가 두 가지로 섞여 있었음.

| 상황 | 이전 동작 | 문제 |
|------|-----------|------|
| Backend 프로세스가 꺼져 있음 | `fetch('/health')` 실패 → 연결 실패 표시 | ✅ 올바름 |
| Backend는 떠 있는데 Neo4j 연결 실패 | `/health`가 Neo4j 쿼리 후 503 반환 → `fetch`는 성공하지만 `res.ok === false` → 같은 "연결 실패" 메시지 | ❌ 사용자는 "백엔드가 안 떠 있다"고 오해 |

즉, **`/health`가 Neo4j 상태까지 포함**하고 있어서, Neo4j만 실패해도 503이 나고 프론트는 이를 "Backend 연결 실패"로만 처리하고 있었음.

## 적용한 수정

### 1. 라이브니스 전용 엔드포인트 추가 (Backend)

- **`GET /ping`** 추가: DB/Neo4j 없이 **프로세스가 살아 있는지만** 확인, 항상 200 + `{"status":"ok","ping":"pong"}`.
- **`GET /health`** 유지: Neo4j 쿼리 수행, 실패 시 503. (기존 동작, 모니터링/헬스체크용)

### 2. 프론트엔드 연결 확인 로직 변경

- **이전**: `await apiCall('/health')` 로 연결 확인 → Neo4j 실패 시에도 503 → "Backend 연결 실패" 표시.
- **이후**: `await apiCall('/ping')` 로 연결 확인 → **백엔드 프로세스가 떠 있는지만** 판단.
  - `ping` 실패 (네트워크/연결 거부) → **"Backend 서버 연결 실패"** (서버 미실행 안내).
  - 이후 노드/엣지 등 API에서 503 발생 → **"일시적으로 서비스를 사용할 수 없습니다"** + Neo4j/.env·Backend 로그 확인 안내.

### 3. 503 전용 UI

- **showServiceUnavailable()** 추가: Neo4j 등 의존 서비스 장애(503) 시 노출.
- 엣지/노드 로드 catch에서 `e.message.includes('503')` 이면 `showServiceUnavailable()`, 그 외에는 기존 `showConnectionError()`.

## 확인 방법

1. **Backend 미실행**
   - Backend 중지 후 페이지 로드 → "Backend 서버 연결 실패" + `make run-be` 안내.
2. **Backend 실행, Neo4j 잘못됨**
   - Backend만 실행하고 Neo4j URI/비밀번호 잘못 설정 → `/ping` 은 200, 그래프 API에서 503 → "일시적으로 서비스를 사용할 수 없습니다" + .env/Neo4j 안내.
3. **둘 다 정상**
   - Backend + Neo4j 정상 → 그래프 로드 성공.

## 요약

- **연결 실패** = Backend 프로세스에 도달하지 못할 때만 사용 (이제 `/ping` 기준).
- **503 (서비스 이용 불가)** = Backend는 도달하지만 Neo4j 등 의존 서비스 오류일 때, 별도 메시지로 구분.

수정 파일: `backend/app/api/v1/endpoints/system.py` (GET /ping), `frontend/graph.html` (ping 사용, 503 시 showServiceUnavailable).
