# CTO 포트폴리오 검토 (호환성·일관성·유지보수성·확장성·협업)

**대상**: 포트폴리오 공유용 저장소  
**원칙**: 컴팩트, 불필요 내용 최소화, 공식/공개 문서 기반 기술 표현

---

## 1. 호환성

| 항목 | 현황 | 권장 |
|------|------|------|
| 실행 환경 | Docker Compose, 로컬(Makefile) 명시 | `.env.example` 필수 항목·설명만 유지, 버전 고정은 `requirements.txt`/`Dockerfile`에만 |
| API | FastAPI, OpenAPI(`/docs`) | README API 표는 실제 라우트와 일치시키고, 그래프·채팅 등 추가 엔드포인트 포함 |
| 프론트 | Streamlit(8501) + 그래프(HTML/Vis.js, 8080 또는 정적) | README에 "Streamlit 앱 + 그래프 시각화(별도 HTML)"로 명시해 구조 일치 |

---

## 2. 일관성

| 항목 | 이슈 | 조치 |
|------|------|------|
| 프로젝트명/표기 | README "GraphIQ" vs 서비스명 "금융회사지배구조" | 한 곳(README 상단)에 "GraphIQ (금융회사지배구조)" 등 한 줄 정의 |
| 문서 vs 코드 | README "Streamlit (채팅 UI)"만 강조 시 그래프 UI 위치 불명확 | 구조도에 `frontend/graph.html`(또는 서빙 경로) 명시 |
| 문서 간 참조 | CHANGELOG·README에서 삭제/이동된 문서 링크 | 포트폴리오용으로 유지할 문서만 남기고, 나머지는 `docs/archive/`로 이동 후 링크 제거 |

---

## 3. 유지보수성

| 항목 | 현황 | 권장 |
|------|------|------|
| docs 수량 | 80개 이상 파일, CTO/QA/UX 개별 이슈 문서 다수 | **활성 문서 최소화**: README, CHANGELOG, 아키텍처 1편(선택). 나머지는 `docs/archive/`로 이동 |
| 주석 | `graph.js` 등에 "CTO:", "QA:", "UX:" 접두어 다수 | **주석 정책**: "왜"만 남기고, "무엇"은 코드/함수명으로. 접두어는 제거하거나 내부 규칙으로만 사용 |
| 단일 소스 | 변경 이력이 여러 문서에 분산 | 이력은 **CHANGELOG.md** 한 곳; 아키텍처·결정 사항은 **한 개 설계 문서**로 통합 |

---

## 4. 확장성

| 항목 | 권장 |
|------|------|
| 설정 | 노드 타입·한도·레이아웃 등은 상수/설정 객체로 분리(이미 상당 부분 적용됨) | 신규 기능은 기존 `*_CONFIG` 패턴 따르기 |
| API | 버전 경로(`/api/v1/`) 유지 | 신규 엔드포인트는 동일 prefix·OpenAPI 태그로 정리 |
| 프론트 | 그래프·채팅 분리 구조 유지 | 새 화면은 라우트/진입점만 README 구조도에 추가 |

---

## 5. 협업 코드

| 항목 | 권장 |
|------|------|
| 커밋 | Conventional Commits(`feat:`, `fix:`, `docs:`) 유지 | CHANGELOG와 메시지 일치시키기 |
| 문서 | 새 합류자가 볼 문서는 README + (선택) ARCHITECTURE.md 수준으로 제한 | 상세 이슈/검토는 archive 또는 팀 위키로 |
| 코드 스타일 | 포맷터/린터 설정 일치, 주석은 이유 위주 | "CTO/QA/UX" 레이블은 PR 템플릿·위키에서만 사용 권장 |

---

## 6. 포트폴리오용 파일 구성 권장

```
project-root/
├── README.md                 # 프로젝트 한 줄 설명, 구조, 실행 방법, API 요약, 문서 1~3개 링크만
├── CHANGELOG.md              # (선택) 루트 또는 docs/ — 시간순 변경 요약
├── docs/
│   ├── ARCHITECTURE.md       # (선택) 스택, 그래프/채팅 아키텍처, 주요 결정 1~2페이지
│   ├── CHANGELOG.md          # 위에서 루트로 두지 않을 경우
│   └── archive/              # 기존 CTO/QA/UX/이슈 문서 전부 이동
├── backend/
├── frontend/
├── .env.example
├── docker-compose.yml
└── Makefile
```

- **README**: 프로젝트명·한 줄 설명, 디렉터리 구조, 빠른 실행(env → up 또는 run-be/run-fe), 테스트, **API 요약 표**(실제 경로 반영), **문서**는 "CHANGELOG, (선택) ARCHITECTURE" 등 1~3개만 링크.
- **docs**: 포트폴리오에서 보여줄 핵심 1~2개만 유지하고, 나머지는 `docs/archive/`로 이동해 링크 제거.

---

## 7. 주석·문서 문구 (공식 톤)

- **기술 표현**: 공식 문서/공개 스펙 기준 용어 사용 (예: Vis.js, Neo4j, FastAPI, OpenAPI).
- **주석**: "CTO: ...", "QA: ..." 등은 제거하거나, 팀 내부용으로만 유지. 대신 "왜 이 값을 쓰는지" 등 한 줄 이유만 남기기.
- **문서**: 감정/캐주얼 표현 배제, "~함", "~됨" 등 단정형으로 통일.

---

## 8. 적용 체크리스트

- [x] README: 프로젝트 한 줄 정의, 구조도에 graph UI 명시, API 표 실제 라우트와 동기화, 문서 링크 3개로 축소
- [x] docs: 활성 문서 3편만 유지(CHANGELOG, CTO-PORTFOLIO-REVIEW, PYGRAPHVIZ-VISJS-HYBRID); 나머지 `docs/archive/` 이동
- [x] 루트: README 외 추가 .md는 `docs/archive/`로 이동
- [ ] (선택) `docs/ARCHITECTURE.md`: 스택·그래프/채팅 구조·주요 결정 1~2페이지로 통합
- [ ] (선택) 주석: `graph.js` 등에서 접두어 정리·중복 설명 제거

---

## 9. 현재 폴더 구조 (포트폴리오용)

```
docs/
├── CHANGELOG.md              # 변경 이력
├── CTO-PORTFOLIO-REVIEW.md   # 본 검토·정리 가이드
├── PYGRAPHVIZ-VISJS-HYBRID.md # 그래프 아키텍처
└── archive/                  # 과거 검토·이슈 문서 (참고용)
```
