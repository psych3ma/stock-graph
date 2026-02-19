# PyGraphviz + Vis.js 하이브리드 아키텍처

## 개요

PyGraphviz로 물리적 위치를 수학적으로 계산하고, Vis.js로 부드러운 UX를 제공하는 하이브리드 방식입니다.

## 아키텍처

```
Backend (Python)
├── PyGraphviz: 고품질 레이아웃 계산 (overlap=scale로 라벨 겹침 방지)
├── NetworkX: 폴백 레이아웃 (Graphviz 없을 때)
└── REST API: JSON으로 좌표 전송 (0~1 정규화)

Frontend (JavaScript)
├── Vis.js: 렌더링 및 인터랙션 (physics: false로 고정 좌표 유지)
└── SVG: 기존 렌더링 (선택적, useVisJs=false)
```

## 설정

### Backend — 효율적인 설치 (CTO 권장)

**기본 경로(권장):** Graphviz 없이 동작합니다.

```bash
cd backend && pip install -r requirements.txt
```

- 레이아웃 엔진 기본값: **NetworkX** (Kamada-Kawai + Spring). 추가 시스템 의존성 없음.
- CI/신규 개발자 온보딩 시 `brew install graphviz` 등 불필요.

**PyGraphviz를 쓰고 싶을 때만** (고품질 레이아웃이 필요한 환경):

1. 시스템에 Graphviz 설치 (한 번만):
   - **macOS:** `brew install graphviz` (의존성 많음 → 아래 Docker 대안 참고)
   - **Ubuntu/Debian:** `sudo apt-get install graphviz libgraphviz-dev pkg-config`
   - **Windows:** [Graphviz 다운로드](https://graphviz.org/download/) 후 PATH 설정
2. Python 패키지: `pip install -r requirements-pygraphviz.txt`
3. API/프론트에서 `engine: "pygraphviz"` 로 요청.

**Docker로 의존성 격리 (가장 효율적인 대안):**

- 로컬에 Graphviz를 설치하지 않고, PyGraphviz 레이아웃이 필요한 환경만 Docker 이미지로 제공.
- 예: `Dockerfile`에서 `RUN apt-get update && apt-get install -y graphviz libgraphviz-dev` 한 번만 수행.
- 로컬/CI는 `requirements.txt`만 설치하고, PyGraphviz 경로는 해당 이미지에서만 사용.

### Frontend

`frontend/graph.js`의 `GRAPH_CONFIG`:

```javascript
const GRAPH_CONFIG = {
  useServerLayout: true,        // 서버 레이아웃 사용
  layoutEngine: 'networkx',      // 기본. 'pygraphviz'는 선택 시에만
  useVisJs: false,               // true: Vis.js 렌더링, false: SVG 렌더링
};
```

## 기능

### 1. 캔버스 동적 크기 (Responsive Canvas)

- `getGraphViewport()`: 컨테이너 크기에 따라 동적 계산
- SVG와 Vis.js 모두 동일한 뷰포트 사용
- 최소 크기: 400x300 (작은 화면 방지)

### 2. 라벨 겹침 방지 (Label Collision Prevention)

**Backend (PyGraphviz):**
- `overlap="scale"`: 노드 간격을 라벨 크기에 비례하여 확대

**Frontend (Vis.js):**
- `font: { background: 'white', strokeWidth: 2, strokeColor: 'white' }`: 라벨 배경으로 가독성 향상

### 3. 부드러운 엣지 (Smooth Curves)

**Vis.js:**
- `smooth: { type: 'continuous', roundness: 0.5 }`: 연속 곡선으로 엣지 렌더링
- 다중 엣지는 자동으로 분리되어 표시

### 4. 클러스터링 (Clustering)

**Vis.js 기본 기능:**
- 더블클릭으로 클러스터 확장/축소
- 향후 확장: 같은 타입의 노드 자동 그룹화 (`visNetwork.cluster()`)

### 5. 물리 엔진 비활성화

- `physics: { enabled: false }`: PyGraphviz 좌표 고정
- `fixed: { x: true, y: true }`: 노드 위치 고정 (드래그 가능하지만 자동 이동 없음)

## API

### POST /api/v1/graph/layout

**Request:**
```json
{
  "nodes": [{"id": "n1", "type": "company", "label": "..."}],
  "edges": [{"from": "n1", "to": "n2", "ratio": 50.0}],
  "width": 1.0,
  "height": 1.0,
  "padding": 0.05,
  "use_components": true,
  "engine": "pygraphviz"  // "networkx" 또는 "pygraphviz"
}
```

**Response:**
```json
{
  "positions": {
    "n1": {"x": 0.2, "y": 0.5},  // 0~1 정규화 좌표
    "n2": {"x": 0.8, "y": 0.5}
  },
  "components": [["n1", "n2"]]
}
```

## 폴백 전략

1. **PyGraphviz 실패 시:** NetworkX로 자동 폴백
2. **서버 레이아웃 실패 시:** 클라이언트 force 시뮬레이션으로 폴백
3. **Vis.js 사용 안 함:** 기존 SVG 렌더링 유지 (`useVisJs=false`)

## 협업 코드 고려사항

- **결정론적 레이아웃:** 동일 데이터는 항상 동일 레이아웃 (seed=42 고정)
- **명확한 계약:** 0~1 정규화 좌표로 프론트/백엔드 분리
- **선택적 기능:** Vis.js는 선택적으로 활성화 가능 (기존 코드와 병행)
- **에러 처리:** 각 단계에서 폴백 전략 제공

## 사용 예시

### PyGraphviz + Vis.js 활성화

```javascript
const GRAPH_CONFIG = {
  useServerLayout: true,
  layoutEngine: 'pygraphviz',
  useVisJs: true,
};
```

### NetworkX + SVG (기본)

```javascript
const GRAPH_CONFIG = {
  useServerLayout: true,
  layoutEngine: 'networkx',
  useVisJs: false,
};
```

## 참고

- [PyGraphviz 문서](https://pygraphviz.github.io/)
- [Vis.js 문서](https://visjs.github.io/vis-network/docs/network/)
- [NetworkX 레이아웃](https://networkx.org/documentation/stable/reference/drawing.html)
