# CTO: Backend 연결 실패 해결 가이드

## 현상

브라우저에 **"Backend 서버 연결 실패"** 표시, 연결 시도 주소 `http://localhost:8000/ping` 로 찍힘.

## 원인

Backend(uvicorn) 프로세스가 **실제로 8000 포트에서 떠 있지 않음**.

- `make run-be` 를 안 했거나
- `make run-be` 실행 시 **Address already in use** 로 실패했거나
- Backend 실행 후 크래시한 경우

## 해결 절차 (반드시 이 순서)

### 1단계: 포트 정리 (기존 Backend가 있을 때)

```bash
make stop-be
```

→ "포트 8000 사용 중인 프로세스 종료" 후 **2단계로**.

### 2단계: Backend 실행 (새 터미널 탭/창에서)

프로젝트 루트에서:

```bash
make run-be
```

- 정상이면 `Uvicorn running on http://0.0.0.0:8000` 로그가 보임.
- **포트 사용 중**이면 1단계 `make stop-be` 먼저 실행.

### 3단계: 연결 확인

다른 터미널에서:

```bash
make check-be
```

- `✅ Backend 정상` 이면 브라우저에서 **다시 시도** 또는 새로고침.
- `❌ Backend에 연결되지 않습니다` 이면 2단계가 실패한 상태 → 2단계 터미널 로그 확인.

## Makefile 변경 사항 (CTO)

| 항목 | 내용 |
|------|------|
| **make run-be** | 실행 전에 **포트 8000 사용 여부** 확인. 사용 중이면 "make stop-be 후 make run-be" 안내 후 종료 (에러 1). |
| **make check-be** | `curl http://localhost:8000/ping` 으로 Backend 연결 확인. 실패 시 위 1~3단계 안내 출력. |
| **연결 실패 화면** | 1) make stop-be 2) make run-be 3) 새로고침 순서로 안내, `make check-be` / `curl .../ping` 진단 안내 추가. |

## 한 줄 요약

**Backend가 안 떠 있어서 연결 실패**이므로, 터미널에서 **`make stop-be` → `make run-be`** 실행 후 브라우저에서 새로고침.
