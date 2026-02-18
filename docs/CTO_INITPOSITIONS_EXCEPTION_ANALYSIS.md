# initPositions() 예외 원인 분석 (CTO 관점)

**목적**: `initPositions()` 안에서 예외가 나는 이유 분석 및 대응 요약.

---

## 1. 예외가 날 수 있는 지점

### 1.1 Promise 반환 전 (동기 실행)

| 위치 | 원인 | 발생 조건 |
|------|------|------------|
| `svg.clientWidth` / `svg.clientHeight` | `svg`가 `null`이면 `TypeError` | `#graphSvg` 요소가 DOM에 없을 때 (예: 스크립트 실행 시점에 그래프 영역이 아직 없음) |
| `EDGES.forEach(...)` | `EDGES`가 배열이 아니면 `TypeError` | `loadGraph()` 중간 실패로 `EDGES`가 `null`/`undefined`이거나 재할당된 경우 |
| `NODES.filter(...)` | `NODES`가 배열이 아니면 `TypeError` | 위와 동일하게 `NODES` 손상 |
| `Math.max(...Array.from(nodeDegrees.values()), 1)` | 빈 배열이면 `Math.max()`는 `-Infinity` 반환 → 이후 연산에서 이상 동작 가능 | `allNodes.length === 0`이면 이미 위에서 `resolve()` 후 return 하므로 실제로는 미발생 |

### 1.2 step() 내부 (requestAnimationFrame 콜백)

| 위치 | 원인 | 발생 조건 |
|------|------|------------|
| `positions[n.id].x` 접근 | `positions[n.id]`가 없거나 삭제된 경우 | 다른 코드에서 `positions`를 덮어쓰거나, 노드 id가 예기치 않게 바뀐 경우 (드물음) |
| `NODE_RADIUS[n.type]` | `n.type`이 예상 외 값이어도 `\|\| 18`로 폴백되어 대부분 안전 | (분석 시점 기준) 실질적 예외 원인 아님 |
| `allNodes.forEach` / 이중 루프 | 대량 노드에서 메모리·연산 부담 | 노드 수가 극단적으로 많을 때 브라우저/탭 지연 가능 (예외보다는 지연) |

### 1.3 정리: 실제로 예외를 유발했을 가능성이 높은 것

1. **`svg`가 null**  
   - 그래프 영역이 아직 렌더되지 않았거나, ID 변경·DOM 제거로 `getElementById('graphSvg')`가 실패한 경우.
2. **`NODES`/`EDGES`가 배열이 아님**  
   - API 실패·부분 로드·다른 스크립트에서 전역 변수 덮어쓰기 등으로 `loadGraph()` 직후 상태가 꼬인 경우.

---

## 2. 적용한 대응

### 2.1 실패 시 격자 폴백 제거

- **변경 전**: `initPositions()` 실패 시 catch에서 원형 배치로 재계산 시도.
- **변경 후**: 실패 시 **폴백 없음**. `positions = {}`로 비우고, `renderGraph()`에서 `positions` 비어 있으면 스킵.
- **이유**: 레이아웃 경로를 “한 가지(initPositions 성공)”로 통일하고, 실패 시에는 빈 화면으로 실패를 명확히 함.

### 2.2 initPositions() 내부 예외 방지

- **사전 조건 검사**
  - `svg` 없음 → 로그 후 `resolve()` 반환.
  - `NODES` 또는 `EDGES`가 배열이 아님 → 로그 후 `resolve()` 반환.
- **step() 래핑**
  - `step()` 전체를 `try/catch`로 감싸, rAF 콜백 안에서 예외가 나도 `reject` 대신 `resolve()` 호출.
- **동기 실행 래핑**
  - `step()` 최초 호출을 `try/catch`로 감싸, 동기 단계에서의 예외도 `resolve()` 후 종료.

그래서 **initPositions()는 이제 예외를 밖으로 전파하지 않고, 항상 resolve()로 끝나도록** 되어 있음.

---

## 3. 호출 측 (loadGraph) 동작

- `await initPositions()` 후에는 **예외가 나지 않음** (항상 resolve).
- 과거에 catch 블록에서 쓰이던 “실패 시 격자/원형 폴백”은 **완전 제거**했고, 실패 시에는 `positions = {}`만 설정하고 다음 단계(렌더)로 진행.
- `renderGraph()`는 `Object.keys(positions).length === 0`이면 렌더하지 않으므로, 레이아웃 실패 시 빈 그래프 영역으로 드러남.

---

## 4. 요약

| 항목 | 내용 |
|------|------|
| 예외 원인 | 주로 `svg` null, `NODES`/`EDGES` 비배열. 드물게 step() 내부 접근 오류. |
| 폴백 | 격자/원형 폴백 제거. 실패 시 `positions = {}`만 적용. |
| 강화 | 사전 조건 검사 + step() 및 동기 실행 try/catch로 항상 resolve. |

이로써 “실패 시 격자 폴백” 제거와 “initPositions() 안에서 예외가 나는 이유 분석 및 제거”가 CTO 관점에서 정리된 상태입니다.
