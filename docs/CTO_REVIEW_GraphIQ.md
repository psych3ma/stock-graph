# GraphIQ CTO 관점 검토

> 아키텍처, 확장성, 운영·보안, 테스트·CI 관점 요약

---

## 1. 아키텍처

| 항목 | 평가 | 비고 |
|------|------|------|
| **관심사 분리** | ✅ | FastAPI(API·비즈니스) / Streamlit(UI) 분리로 역할 명확 |
| **레이어 구조** | ✅ | api → services → core/schemas 로 의존성 일방향 |
| **설정 중앙화** | ✅ | core/config + .env 로 비밀/설정 격리 |
| **API 버저닝** | ✅ | /api/v1/ 로 v2 전환 시 무중단 대응 가능 |

---

## 2. 확장성

- **엔드포인트 추가**: `backend/app/api/v1/endpoints/` 에 파일 추가 후 `api.py` 에 라우터 등록만 하면 됨.
- **새 AI/외부 연동**: `backend/app/services/` 에 서비스 모듈 추가, 엔드포인트에서 주입해 사용.
- **프론트 페이지 추가**: `frontend/src/pages/` 에 페이지 추가 후 `main.py` 또는 멀티페이지 라우팅으로 연결.

---

## 3. 운영·보안

- **비밀 관리**: `.env` 사용, `.env.example` 로 필수 키 목록 문서화. 프로덕션은 Secrets Manager 권장.
- **에러 노출**: 5xx 시 사용자용 메시지 고정, 상세는 로그 전용(UX 리뷰 반영).
- **CORS**: 기본 `allow_origins=["*"]` → 프로덕션에서는 프론트 도메인만 명시 권장.
- **헬스체크**: `/health` 로 Neo4j 연결·노드 통계 제공 → 로드밸런서/오케스트레이션 연동 가능.

---

## 4. 테스트·CI

- **backend/tests/**: API 스펙 테스트(TestClient) 필수. 서비스 레이어 단위 테스트는 선택.
- **CI**: pytest + (선택) ruff/black. Docker 빌드로 배포 경로 검증.
- **포트폴리오**: 테스트 존재·CI 파이프라인 명시가 신뢰도 상승.

---

## 5. 디렉터리별 역할 (컴팩트 세팅 기준)

```
backend/app/
  core/       → 설정, 로깅(추가 시) — 앱 전역
  schemas/    → 요청/응답 DTO — API 계약
  services/   → Neo4j, Embedding, QA Chain — 비즈니스·외부 연동
  api/v1/     → 라우트·엔드포인트 — HTTP 계층만

frontend/
  src/services/     → API 클라이언트 — 백엔드 결합도 격리
  src/components/  → 사이드바 등 재사용 UI
  main.py           → Streamlit 진입·페이지 구성
```

---

## 6. 우선 적용 권장 (CTO)

1. **환경변수 검증**: 앱 기동 시 필수 env 누락이면 즉시 실패 + 명확한 메시지.
2. **/health 의존성**: Neo4j/OpenAI 불가 시 503 + 사용자용 메시지.
3. **테스트 최소 세트**: `GET /`, `GET /health`, `POST /chat` (mock 또는 테스트 DB).
4. **README**: 실행 방법, `.env.example` 복사, Docker 한 줄 실행 명령.

이 구조로 컴팩트 세팅 완료 시, Colab 단일 노트북 대비 유지보수·협업·배포가 모두 개선됨.
