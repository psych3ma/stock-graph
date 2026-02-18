# CTO 관점 검토 (GraphIQ)

**검토 기준**: 아키텍처, 유지보수성, 확장성, 성능·안정성, 기술 부채, 운영  
**대상**: `frontend/graph.html`, `backend/`, 설정·문서

---

## 1. 현재 상태 요약

| 구분 | 내용 |
|------|------|
| **프론트** | 단일 HTML (`graph.html` ~2,350줄) — HTML + CSS(디자인 토큰) + JS(그래프·API·채팅·UI) |
| **백엔드** | FastAPI, Neo4j, GenAI — `/api/v1/graph/*`, `/api/v1/chat`, 노드/엣지/ego/노드상세 |
| **그래프 엔진** | 커스텀 Force Simulation (D3/Vis 미사용) — Gravity/Repulsion/Spring, Component Packing, Fit-to-extent 후처리 |
| **설정** | `LAYOUT_CONFIG`, `GRAPH_CONFIG`, `LABEL_CONFIG`, CSS `:root` 토큰으로 상수 집약 |

---

## 2. 강점

- **설정 집약**: Force/레이블/노드 타입이 CONFIG 블록에 모여 있어 튜닝·확장 시 한 곳만 수정 가능.
- **디자인 토큰**: `:root` 색상·간격·폰트·radius 일원화, 테마/다크모드 확장 용이.
- **API 구조**: 버전 prefix `/api/v1`, 그래프·채팅·시스템 엔드포인트 분리, Neo4j 스키마 문서화(`NEO4J_REVIEW.md`).
- **문서**: CTO/UX/HTML·CSS 검토 문서가 `docs/`에 정리되어 있어 온보딩·의사결정 추적에 유리.
- **가드 로직**: `renderGraph()`에서 `positions` 없으면 스킵, `loadGraph()`에서 에러 시 상태 메시지·폴백 처리.

---

## 3. 리스크 및 기술 부채

| 항목 | 내용 | 영향도 |
|------|------|--------|
| **단일 파일 프론트** | `graph.html`에 마크업·스타일·비즈니스 로직·이벤트가 모두 포함 | 유지보수·협업 시 충돌·가독성 저하 |
| **테스트 부재** | 프론트 그래프/레이아웃/채팅에 대한 자동화 테스트 없음 | 리팩터·배포 시 회귀 위험 |
| **CORS** | `allow_origins=["*"]` | 프로덕션에서는 도메인 제한 필요 |
| **API 베이스** | 프론트에서 `localhost:8000` 하드코딩 폴백 | 환경별 설정(빌드/런타임) 분리 권장 |
| **대용량 그래프** | 노드 500·엣지 200 수준, DOM/SVG 전부 생성 | 수천 노드 시 지연·메모리 이슈 가능 |

---

## 4. 권장 사항 (우선순위)

### P0 (단기)

1. **프론트 분리**  
   - `graph.css` / `graph.js` 분리 또는 최소한 `graph.html` 내에서 스크립트를 논리 단위로 분할.  
   - 팀 규모가 커지면 Vite/React 등으로 전환 검토.
2. **CORS·환경 변수**  
   - 프로덕션용 `allow_origins` 화이트리스트.  
   - API 베이스 URL을 환경 변수 또는 빌드 시 주입으로 통일.

### P1 (중기)

3. **프론트 테스트**  
   - 레이아웃/노드 수/엣지 수 검증, `loadGraph` 실패 시 UI 상태 등에 대한 단위·통합 테스트 추가.
4. **대용량 대응**  
   - 노드 수 임계치 초과 시 샘플링·페이지네이션 또는 Canvas/WebGL 전환 검토.  
   - `GRAPH_CONFIG.limits`와 백엔드 limit 정책 정리.

### P2 (장기)

5. **에러 모니터링**  
   - API 실패·Neo4j 타임아웃 등 클라이언트/서버 로깅·모니터링 연동.
6. **접근성·i18n**  
   - `docs/HTML_CSS_REVIEW.md` 권장 사항 이어서 적용(포커스, ARIA, 대비).

---

## 5. 아키텍처 다이어그램 (개념)

```
[Browser]
  graph.html ←→ API_BASE (/api/v1)
       │            │
       ├─ loadGraph → GET /graph/nodes, /graph/edges
       ├─ loadEgoGraph → GET /graph/ego?node_id=...
       ├─ loadNodeDetail → GET /graph/nodes/{id}
       └─ sendChatMessage → POST /chat
                │
[Backend]
  FastAPI → graph_router, chat_router, system_router
       │
       ├─ Neo4j (nodes, edges, Cypher)
       └─ LLM (GenAI) for /chat
```

---

## 6. 결론

- **운영·확장**: 설정·API·문서가 정리되어 있어, 레이아웃/노드 수/엣지 정책 변경은 현재 구조로도 대응 가능.
- **유지보수**: 단일 HTML 파일과 테스트 부재가 가장 큰 부채; 단계적 분리와 테스트 추가를 권장.
- **성능**: 현재 limit(노드 500·엣지 200) 내에서는 무리 없음. 그 이상은 샘플링 또는 렌더링 방식 전환 검토.

이 문서는 `docs/` 내 다른 CTO 검토 문서와 함께 의사결정·리팩터 계획 수립 시 참고용으로 유지하면 됩니다.
