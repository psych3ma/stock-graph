# HTML/CSS 전문가 관점 검토: 확장성·유지보수성·일관성·협업

**대상**: `frontend/graph.html` (단일 파일 SPA)  
**검토 기준**: 하드코딩 최소화, 확장성, 유지보수성, 일관성, 협업 친화 코드

---

## 1. 잘 되어 있는 부분

- **Design Tokens (`:root`)**: `--pwc-orange`, `--text-1`, `--border`, `--panel-w` 등 시맨틱·브랜드 변수로 테마 변경 시 한 곳만 수정 가능.
- **추가 토큰**: `--edge-stroke`, `--surface-tint`, `--accent-alpha-*` 등 그래프/강조색을 변수화해 CSS 내 하드코딩을 줄임.
- **GRAPH_CONFIG**: 노드 타입·API limit이 한 객체에 모여 있어 확장 시 수정 지점이 명확함.
- **네이밍**: `nd-`(node detail), `ri-`(related item), `msg-`(message) 등 컴포넌트 접두사로 구역 구분 가능.

---

## 2. 개선 권장 사항

### 2.1 확장성

| 항목 | 현재 | 권장 |
|------|------|------|
| **레이아웃 상수** | `initPositions`/`computeHierarchicalLayout` 내부에 80, 70, 58, 220 등 매직 넘버 산재 | `LAYOUT_CONFIG`(또는 `GRAPH_LAYOUT`) 객체로 상수 집약. 홉 수·최대 노드·패딩·minDist 등 한 곳에서 관리 |
| **노드 타입 추가** | `GRAPH_CONFIG.nodeTypes` + `NODE_COLORS` + `NODE_RADIUS` + CSS `--node-*` 를 여러 곳에 추가 | 타입 배열을 Single Source of Truth로 두고, 색/반경/레이블을 `nodeTypes: [{ id, label, colorVar, radius }]` 형태로 확장 |
| **SVG 색상** | JS `setAttribute('fill', '#fff4ed')` 등 하드코딩 | `getComputedStyle(document.documentElement).getPropertyValue('--surface-tint').trim()` 등 CSS 변수 읽어 사용하거나, SVG용 `<style>` 블록에서 `.edge-active { stroke: var(--pwc-orange); }` 로 클래스 제어 |

### 2.2 유지보수성

| 항목 | 현재 | 권장 |
|------|------|------|
| **인라인 스타일** | `style="background:var(--node-company)"`, `style="background:#fff4ed;color:#d85604"` 등 HTML/템플릿 내 존재 | 필터 팩: `[data-filter="company"] .filter-dot { background: var(--node-company); }` 로 대체. `ri-val` 은 클래스로 배경/글자색 지정 후 인라인 제거 |
| **긴 스크립트** | 2000줄 이상 단일 파일 | 기능별 주석 블록(API / STATE / LAYOUT / RENDER / PANEL / CHAT) 유지. 장기적으로는 모듈 분리(그래프 엔진 / 패널 / 채팅) 검토 |
| **이벤트 바인딩** | `onclick="toggleFilter(this)"` 등 인라인 핸들러 다수 | 유지해도 되나, 중요한 흐름은 상단에 “이벤트 소스 목록” 주석으로 정리 시 협업 시 추적 용이 |

### 2.3 일관성

| 항목 | 현재 | 권장 |
|------|------|------|
| **색상** | CSS에는 `var(--pwc-orange)`, JS에는 `'#d85604'`, SVG에는 `#8b7d6f` 등 혼재 | 브랜드/강조색은 CSS 변수만 사용. JS·SVG는 필요 시 `getPropertyValue('--pwc-orange')` 로 참조하거나, 최소한 한 객체(예: THEME_HEX)에만 hex 모아두기 |
| **간격 스케일** | 4, 6, 8, 10, 12, 16, 20, 32 등 ad-hoc | `:root`에 `--space-1` ~ `--space-4` (4/8/16/24 등) 정의 후 padding/margin에 적용하면 변경 시 일관성 확보 |
| **폰트 크기** | 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 18, 20 등 | `--text-xs` ~ `--text-lg` 같은 타입 스케일 도입 시 타이포그래피 일관성 향상 |

### 2.4 협업

| 항목 | 현재 | 권장 |
|------|------|------|
| **파일 구조** | 스크립트가 길어서 섹션 구분이 주석에만 의존 | 상단에 “1) CONFIG 2) STATE 3) API 4) LAYOUT 5) RENDER 6) PANEL 7) CHAT 8) INIT” 등 목차 주석 유지 |
| **네이밍 규칙** | nd-, ri-, msg- 등 혼용 | 팀 내 규칙 문서에 “접두사: nd=노드 상세, ri=연결 항목, msg=채팅 메시지” 명시 |
| **Design Tokens** | 이미 :root 주석으로 용도 설명 | “확장/테마 시 :root 만 수정” 문구 유지. 새 변수 추가 시 주석에 용도와 사용처 한 줄씩 기입 |

---

## 3. 적용된 변경 요약

- **:root**  
  - `--edge-stroke`, `--edge-stroke-active`, `--surface-tint`, `--surface-tint-strong`, `--border-tint`, `--accent-alpha-*`, `--status-ok`, `--surface-overlay` 추가.  
  - Design Tokens 블록 주석으로 용도·확장 방법 명시.
- **CSS**  
  - `.filter-pill.active`, `.search-wrap:focus-within`, `.chat-context-bar`, `.ctx-chip`, `.src-db`, `.related-item.active` 등에서 하드코딩 색상을 위 변수로 교체.
- **협업**  
  - 스타일 상단에 DESIGN TOKENS 설명 주석 추가.

---

## 4. 우선 적용하면 좋은 다음 단계

1. **JS에 `LAYOUT_CONFIG` 도입**: `padding`, `minDist`, `maxRadius`, `minNodeSpacing`, `subRowHeight`, `maxIter` 등을 한 객체로 모으기.
2. **SVG 색상**: 엣지/노드 fill·stroke를 CSS 변수에서 읽는 `getCSSVar('--pwc-orange')` 같은 헬퍼 사용.
3. **필터/ri-val 인라인 제거**: `data-filter` + CSS로 dot 색상, `.ri-val` 클래스로 비율 칩 스타일 고정.
4. **스크립트 상단**에 “File structure” 목차 주석 추가.

이후 단계로는 타입 스케일(`--text-xs` 등), 간격 스케일(`--space-*`), 그리고 필요 시 그래프/패널/채팅 모듈 분리를 검토할 수 있습니다.
