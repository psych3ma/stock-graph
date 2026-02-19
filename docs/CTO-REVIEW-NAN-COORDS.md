# CTO 검토: NaN 좌표 현상 및 첨부 해결방안

**증상**: 엣지/라벨 SVG에 `x2="NaN" y2="NaN"`, `x="NaN" y="NaN"` 등이 찍혀 화면이 깨짐.

**원인 요약**: `positions[id].x` 또는 `.y`가 NaN이 되거나, `dist = Math.sqrt(dx*dx+dy*dy)`가 0/NaN이면 `ex = p2.x - (dx/dist)*...` 등이 NaN이 되어 DOM에 그대로 전달됨.

---

## 적용한 대응 (이번 수정)

1. **엣지 렌더링 단계**
   - `p1`, `p2` 존재 여부뿐 아니라 **`isFiniteCoord(p)`** 로 `p.x`, `p.y` 유효성 검사.
   - `dist`가 비유한(non-finite)이거나 너무 작으면(< 1e-6) 해당 엣지 스킵.
   - 위 조건에 걸리면 해당 엣지는 그리지 않고 `missingEdgeCount` 증가, 콘솔 경고만 출력.

2. **레이아웃 스케일 단계**
   - `scale = Math.max(1, Math.min(...))` 계산 후 **`Number.isFinite(scale)` 검사**. 비정상이면 `scale = 1`로 폴백.
   - 스케일 적용한 `x`, `y`를 쓸 때 **`Number.isFinite(x/y)`** 확인 후, 비유한 값이면 `extentCx`/`extentCy`로 대체해 NaN이 positions에 쓰이지 않도록 함.

---

## 첨부 해결방안 검토

| 제안 | 내용 | CTO 판단 |
|------|------|----------|
| **① isNaN() 가드** | “모든 좌표 업데이트 직후 `if (isNaN(x)) throw Error`로 범인을 잡자” | **일부 반영**. 렌더 단계에서는 스킵으로 NaN 노출을 막고, 레이아웃 스케일에서는 비유한 값 시 폴백 적용. “범인”을 찾으려면 `initPositions` 내부에서 `positions[n.id].x/y` 대입 직후 `if (!Number.isFinite(positions[n.id].x)) throw new Error('NaN at ' + n.id)` 같은 가드를 임시로 넣어 스택을 확인하는 방식을 권장. |
| **② Config 파일 분리** | `force_config.js`를 만들어 모든 숫자를 그쪽으로 이전 | **구조 개선용**. 현재는 `LAYOUT_CONFIG`, `GRAPH_CONFIG` 등이 `graph.js` 상단에 있음. 설정만 별도 파일로 빼면 가독/튜닝에 유리하나, NaN 직접 원인은 아님. 우선순위는 낮게 두고 리팩터 단계에서 진행 권장. |
| **③ 라벨 길이 반영** | 노드 radius를 고정값이 아닌 `label.length * 상수`로 | **이미 반영됨**. `getLayoutRadius(node)`에서 `node.label`/`node.name` 길이와 `LABEL_CONFIG.pxPerChar`로 물리 반경을 계산하고, 레이아웃/충돌/반발에 사용 중. |

---

## 근본 원인 추적 시 권장

- **레이아웃 내 가드**: `initPositions`의 force step 및 스케일 적용 루프에서, `positions[n.id].x`/`.y`를 대입한 직후  
  `if (!Number.isFinite(positions[n.id].x) || !Number.isFinite(positions[n.id].y)) throw new Error('NaN position ' + n.id);`  
  를 임시로 넣어 두면, NaN이 처음 발생하는 노드/시점을 콜스택으로 확인할 수 있음.
- **가능한 발생처**: (1) 초기 배치에서 `radiusX`/`radiusY`가 NaN인 경우, (2) `extent.xMin` 등이 NaN이어서 스케일/클램프가 NaN을 만드는 경우, (3) force step에서 `centerX`/`centerY` 또는 `extent`가 비유한 값인 경우. `getGraphViewport()`가 0을 반환하거나, 노드가 0개인 상태에서 bbox를 쓰는 경로도 점검할 것.
