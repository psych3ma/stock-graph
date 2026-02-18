# 레이아웃 격자 뭉침 현상 수정 (HTML/레이아웃 관점)

## 원인

노드가 **격자처럼 세로로 뭉쳐 보이던** 이유는 다음 두 가지입니다.

### 1. `initPositions()` 실패 시 격자 폴백 사용

- 정상 경로: 원형 초기 배치 → force-directed 반복 → 자연스러운 분산.
- **실패 시** `loadGraph()`의 `catch`에서 **격자 배치**로 폴백:
  - `col = i % cols`, `row = Math.floor(i / cols)`
  - `x: 100 + col * 150`, `y: 100 + row * 150`
- 이 폴백이 실행되면 노드가 **가로/세로 격자**로 쌓여 보입니다.

### 2. SVG 크기가 0이거나 너무 작을 때

- `graphW = svg.clientWidth - panelW` 이 0 또는 음수면:
  - `centerX`, `maxRadius`가 0에 가깝고,
  - 노드가 한 점 근처로 모이거나, 경계 클램핑으로 한쪽으로 밀려 **세로 줄**처럼 보일 수 있습니다.
- 페이지 로드 직후 한 프레임에는 그래프 영역이 아직 크기를 못 잡은 상태일 수 있어, 위와 같은 현상이 나올 수 있습니다.

---

## 수정 사항

### 1. 격자 폴백 제거 → 원형 폴백으로 통일

- **변경 전**: `initPositions()` 예외 시 **cols/row 격자**로 배치.
- **변경 후**: 같은 예외 시에도 **원형 배치**만 사용:
  - `angle = (i / N) * 2π`, `radius = maxRadius * (0.3 + random * 0.7)`, 약간의 jitter.
- 결과: 실패해도 **격자로 뭉치지 않고** 원형으로 퍼지도록 유지.

### 2. SVG 최소 크기 보장

- `W = Math.max(svg.clientWidth || 900, 400)`
- `H = Math.max(svg.clientHeight || 600, 300)`
- `graphW = Math.max(W - panelW, 400)`
- SVG가 아직 0이어도 **최소 400×300(그래프 영역 400)** 을 쓰도록 해, 한 점으로 수렴하거나 격자처럼 보이는 현상을 방지.

### 3. 레이아웃 한 프레임 지연 후 실행

- `await new Promise(r => requestAnimationFrame(r));` 후 `initPositions()` 호출.
- DOM/레이아웃이 한 번 그려진 뒤에 `clientWidth`/`clientHeight`가 확정되므로, **실제 크기 기준**으로 원형·force-directed가 동작합니다.

---

## 요약

| 구분 | 내용 |
|------|------|
| **원인** | (1) 실패 시 격자 폴백 사용 (2) SVG 크기 0/과소로 인한 한 점·한 줄 수렴 |
| **조치** | 격자 폴백 제거 → 원형 폴백만 사용, SVG 최소 크기 보장, 한 프레임 지연 후 `initPositions()` 실행 |
| **파일** | `frontend/graph.html` (`initPositions`, `loadGraph` catch 블록) |

이제 실패 시에도 노드가 격자로 뭉치지 않고, 로드 직후에도 최소 크기와 원형 배치로 자연스럽게 퍼지도록 동작합니다.
