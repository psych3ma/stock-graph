# 다음 단계 실행 가이드

## 1. Docker 이미지 빌드 검증

```bash
# Backend (PyGraphviz 포함)
docker build -t stock-graph-backend ./backend

# 전체 스택
docker-compose build
docker-compose up -d
```

**확인**: `docker run --rm stock-graph-backend python -c "import pygraphviz; print('OK')"` → PyGraphviz 로드 여부 확인

---

## 2. 프로덕션 배포 체크리스트

| 항목 | 작업 |
|------|------|
| CORS | `.env`에 `CORS_ORIGINS=https://your-frontend-domain.com` (쉼표 구분 다중 가능) |
| API Base | `graph.html` 배포 시 `window.GRAPHIQ_API_BASE = 'https://api.example.com';` 주입 |
| 환경변수 | NEO4J_URI, NEO4J_PASSWORD, OPENAI_API_KEY 설정 확인 |

---

## 3. Vis.js 렌더링 확인

1. Backend 실행: `make run-be` 또는 `uvicorn app.main:api --host 0.0.0.0 --port 8000`
2. 브라우저에서 `frontend/graph.html` 열기 (또는 정적 서버로 서빙)
3. 그래프 로드 후 노드·엣지 곡선·라벨 배경 표시 확인

---

## 4. (선택) 성능·폴백 모니터링

- 서버 로그: PyGraphviz 실패 시 "PyGraphviz layout failed, falling back to NetworkX" 출력
- 프론트: 레이아웃 폴백 시 상태바에 "로컬 계산 모드로 전환되었습니다" 표시

---

**요약**: Docker 빌드 → 배포 시 CORS·API Base 설정 → 브라우저에서 그래프 동작 확인.
