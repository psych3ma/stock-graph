# CTO: Address already in use (포트 8000) 대응

## 이슈

`make run-be` 실행 시:

```
ERROR:    [Errno 48] Address already in use
make: *** [run-be] Error 1
```

**원인**: 포트 8000을 이미 다른 프로세스(이전 uvicorn 인스턴스 등)가 사용 중.

## 해결

### 1. 즉시 해결

```bash
make stop-be   # 포트 8000 사용 프로세스 종료
make run-be    # Backend 다시 시작
```

### 2. Makefile 변경 사항

- **`make stop-be`** 타깃 추가
  - `lsof -ti :8000`으로 PID 조회 후 `kill -9` 실행
  - 포트가 비어 있으면 "프로세스 없음" 메시지 출력
- **`make help`**에 `make stop-be` 설명 추가

### 3. 수동 확인/종료

```bash
lsof -i :8000                    # 사용 중인 프로세스 확인
kill -9 $(lsof -ti :8000)        # 해당 프로세스 강제 종료
```

## 정리

| 명령 | 용도 |
|------|------|
| `make run-be` | Backend 시작 (포트 8000) |
| `make stop-be` | 포트 8000 사용 중인 프로세스 종료 (재시작 전 정리) |

재발 시: 이전 터미널에서 uvicorn이 아직 실행 중이면 먼저 그 터미널에서 Ctrl+C로 종료하거나, `make stop-be` 후 `make run-be` 실행.
