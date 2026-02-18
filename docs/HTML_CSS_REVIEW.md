# HTML/CSS 전문가 관점 검토 (확장성·유지보수성·일관성·협업)

**대상**: `frontend/graph.html`  
**기준**: 하드코딩 최소화, 디자인 토큰, 일관된 네이밍, 협업 친화적 구조

---

## 1. 확장성 (Scalability)

### 잘 된 점
- **`:root` 디자인 토큰**: 색상·폰트·radius·shadow가 CSS 변수로 집약되어 있어 테마/다크모드 확장 시 한 곳만 수정 가능.
- **JS 설정 집약**: `GRAPH_CONFIG`, `LAYOUT_CONFIG`, `NODE_COLORS`, `NODE_RADIUS`로 레이아웃·노드 관련 상수가 한 블록에 모여 있음.
- **노드 타입 배열**: `GRAPH_CONFIG.nodeTypes` 기반으로 필터/범례/카운트가 연동되어, 새 타입 추가 시 타입 이름만 추가하면 됨.

### 개선 권장
- **간격 스케일**: 주석에만 있는 `--space-*`를 실제로 정의해 두고, `padding`/`gap`/`margin`을 `var(--space-2)` 등으로 통일하면 새 컴포넌트 추가 시 일관된 간격 유지에 유리함.
- **타이포 스케일**: `--text-xs`, `--text-sm`, `--text-base` 등 폰트 크기 토큰을 두고 사용하면, 반응형이나 접근성 조정 시 한 곳만 바꿀 수 있음.
- **SVG 색상**: JS에서 `#d85604`, `#8b7d6f` 등을 직접 쓰지 말고, `getComputedStyle(document.documentElement).getPropertyValue('--edge-stroke')` 등으로 CSS 변수에서 읽어 쓰면, 테마 변경 시 그래프 색도 자동으로 맞춰짐.

---

## 2. 유지보수성 (Maintainability)

### 잘 된 점
- **파일 구조 주석**: CONFIG → STATE → API → LAYOUT → RENDER → PANEL → CHAT → INIT 순서가 상단에 명시되어 있어, 코드 찾기가 수월함.
- **CSS 섹션 구분**: `/* ── TOP BAR ── */` 등으로 블록이 나뉘어 있어 스타일 수정 시 범위를 좁히기 쉬움.
- **BEM 유사 네이밍**: `.nd-header`, `.nd-stat`, `.legend-row` 등 컴포넌트 단위 접두어로 역할이 드러남.

### 개선 권장
- **인라인 스타일 제거**: `style="font-size:11px;color:var(--text-3)"`, `style="display:none"` 등은 유지보수·재사용을 위해 클래스로 대체하는 것이 좋음. (예: `.filter-group-label`, `.is-hidden`.)
- **숨김/표시 상태**: `display:none`을 JS에서 직접 넣지 말고 `.is-hidden` / `.is-visible` 같은 유틸 클래스로 제어하면, 나중에 전환 애니메이션이나 접근성(aria-hidden 등) 적용이 쉬움.
- **하드코딩 색상**: `.src-db-empty`, `.src-llm` 내부의 `#fffbf0`, `#f5d896` 등은 `:root`에 `--surface-warning`, `--border-warning` 등을 두고 참조하면 테마 변경 시 유리함.

---

## 3. 일관성 (Consistency)

### 잘 된 점
- **색상**: 대부분 `var(--text-1)`, `var(--border)`, `var(--pwc-orange)` 등 토큰 사용.
- **radius**: `var(--r)`, `var(--r-lg)` 사용으로 모서리 스타일이 통일됨.
- **그래프 노드 색**: `NODE_COLORS`와 CSS `--node-*`가 동일한 hex를 가져 시각적 일치가 잘 맞음.

### 개선 권장
- **간격 수치**: `4px`, `8px`, `12px`, `16px`, `20px` 등이 여러 곳에 흩어져 있으므로, `--space-1`(4px) ~ `--space-6`(24px) 정도의 스케일을 정의하고 점진적으로 적용하면 일관성이 높아짐.
- **폰트 크기**: `10px`, `11px`, `11.5px`, `12px`, `13px` 등이 혼재하므로, 작은 타이포 스케일(`--text-xs` ~ `--text-lg`)을 두고 맞추면 가독성·일관성 모두 좋아짐.
- **범례 아이콘 색**: 첫 번째 행만 인라인으로 `background:var(--node-company)`를 주고 있는데, 네 행 모두 `data-count-type` + CSS 선택자로 배경색을 주면 마크업·스타일 규칙이 동일해짐.

---

## 4. 협업 코드 (Collaboration)

### 잘 된 점
- **단일 파일 구조**: HTML/CSS/JS가 한 파일에 있어 초기 진입은 쉽고, 상단 주석으로 역할 구역이 나뉘어 있음.
- **설명 주석**: “레이아웃 상수 집약 (매직 넘버 제거)” 등 의도가 드러나 있어, 나중에 수정하는 사람이 맥락을 파악하기 좋음.

### 개선 권장
- **컨벤션 문서화**: 이 검토 문서처럼 “색상/간격은 :root만 수정”, “인라인 style 사용 금지”, “숨김은 .is-hidden 클래스” 등을 팀 규칙으로 두면 리뷰·온보딩이 수월함.
- **CSS/JS 분리 옵션**: 규모가 커지면 `graph.css` / `graph.js`로 분리하고, 빌드에서 합치는 방식을 고려할 수 있음. 당장은 단일 파일이어도 “앞으로 분리 시 이 경계로 자르면 된다”는 주석만 있어도 협업에 도움이 됨.
- **네이밍 규칙**: “상태는 `is-*`, 수정자는 `--*`, 블록은 접두어(nd-, legend-)” 등을 짧게 정리해 두면 네이밍 충돌을 줄일 수 있음.

---

## 5. 적용한 개선 요약

| 항목 | 조치 |
|------|------|
| 간격 토큰 | `:root`에 `--space-1` ~ `--space-6` 추가, 일부 컴포넌트에 적용 |
| 인라인 스타일 | “필터:” 라벨 → `.filter-group-label`, 범례 → `data-count-type` + CSS |
| 숨김/표시 | `.is-hidden` 유틸 클래스 도입, ego 배너·채팅 탭 등에 적용 |
| SVG/JS 색상 | 엣지·레이블 색을 CSS 변수에서 읽는 `getThemeColor()` 사용 |
| 경고/에러 색 | `.src-db-empty`, `.src-llm`용 `--surface-warning`, `--surface-error` 등 토큰 추가 |

---

## 6. 추가 권장 (선택)

- **접근성**: 포커스 스타일(`:focus-visible`), 대비 비율 확인, ARIA 속성 보완.
- **반응형**: `--panel-w`, `--top-h` 등을 미디어쿼리에서 조정해 작은 화면 대응.
- **성능**: 그래프 노드 수가 매우 많을 때 가상화·캔버스 전환 검토.

이 문서는 `frontend/graph.html` 수정 시 참고용으로 유지하면 됩니다.
