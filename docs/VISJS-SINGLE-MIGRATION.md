# Vis.js 단일 체제 전환 완료

## 개요

SVG 렌더링 코드를 완전히 제거하고 Vis.js 단일 렌더링 엔진으로 전환했습니다. 유지보수성과 확장성을 향상시켰습니다.

---

## 변경 내역

### 1. HTML 변경

**제거**: `<svg id="graphSvg">` 전체 블록 (defs, edgeGroup, nodeGroup 포함)

**변경**: `visNetworkContainer` 인라인 스타일 제거, CSS로 처리

```html
<!-- 변경 전 -->
<div id="visNetworkContainer" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; display: none;"></div>
<svg id="graphSvg">...</svg>

<!-- 변경 후 -->
<div id="visNetworkContainer"></div>
```

---

### 2. CSS 변경

**제거**: SVG 관련 스타일 (`#graphSvg`, `.hidden`, `.visible` 클래스)

**변경**: `#visNetworkContainer` CSS로 완전 처리

```css
/* 변경 전 */
#graphSvg { display: block; z-index: 1; }
#graphSvg.hidden { display: none !important; }
#visNetworkContainer { display: none; z-index: 2; }
#visNetworkContainer.visible { display: block !important; }

/* 변경 후 */
#visNetworkContainer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}
```

---

### 3. JavaScript 변경

#### 제거된 변수/함수
- `const svg`, `const edgeG`, `const nodeG` 변수
- `let drag`, `let pan`, `let zoom` 변수 (Vis.js가 내부적으로 처리)
- `GRAPH_CONFIG.useVisJs` 설정 (항상 Vis.js 사용)
- `renderGraph()` 내 SVG 렌더링 코드 전체 (~300줄)
- `startNodeDrag()`, `applyTransform()`, `fitToView()`, `resetView()` 함수
- SVG 이벤트 리스너 (`svg.addEventListener`)

#### 추가된 함수
- `setupZoomControls()`: 줌 버튼을 Vis.js Network API로 연결

#### 변경된 함수
- `renderGraph()`: 단순히 `renderGraphWithVisJs()` 호출만 수행
- `renderGraphWithVisJs()`: Vis.js 라이브러리 로드 확인 강화, 컨테이너 크기 인라인 스타일 제거
- `getGraphViewport()`: SVG 관련 코드 제거

#### 줌 기능 변경

**변경 전 (SVG)**:
```javascript
document.getElementById('zoomIn').onclick = () => {
  zoom = Math.min(3, zoom * 1.2);
  applyTransform(); // SVG transform 적용
};
```

**변경 후 (Vis.js)**:
```javascript
zoomInBtn.onclick = () => {
  if (visNetwork) {
    const scale = visNetwork.getScale();
    visNetwork.moveTo({ scale: Math.min(3, scale * 1.2) });
  }
};
```

**fitToView 변경**:
```javascript
// 변경 전
fitToView(); // SVG 바운딩 박스 계산

// 변경 후
visNetwork.fit({ animation: { duration: 300 } });
```

---

## 코드 정리 통계

| 항목 | 제거된 코드 |
|------|-------------|
| HTML 라인 | ~15줄 (SVG 블록) |
| CSS 라인 | ~15줄 (SVG 스타일) |
| JS 라인 | ~400줄 (SVG 렌더링 + 이벤트 처리) |
| 변수 | 6개 (svg, edgeG, nodeG, drag, pan, zoom) |
| 함수 | 4개 (startNodeDrag, applyTransform, fitToView, resetView) |

---

## 유지보수성/확장성 향상

1. **단일 렌더링 엔진**: SVG/Vis.js 분기 로직 제거로 코드 복잡도 감소
2. **명확한 책임 분리**: Vis.js가 줌/드래그/인터랙션 모두 처리
3. **CSS 기반 레이아웃**: 인라인 스타일 제거로 스타일 관리 용이
4. **표준 API 사용**: Vis.js Network API로 확장성 확보

---

## 검증 방법

1. **줌 버튼 동작**: `+`, `-`, `⊡` 버튼 클릭 시 Vis.js 줌 동작 확인
2. **드래그**: 노드 드래그가 Vis.js 기본 동작으로 작동하는지 확인
3. **렌더링**: 그래프가 Vis.js로만 렌더링되는지 확인 (개발자 도구에서 SVG 요소 없음)

---

## 참고

- Vis.js Network API: https://visjs.github.io/vis-network/docs/network/
- 줌 메서드: `network.moveTo()`, `network.fit()`, `network.getScale()`

---

**CTO 메시지**: "SVG 관련 코드를 완전히 제거하여 코드베이스를 단순화하고 유지보수성을 향상시켰습니다. Vis.js 단일 체제로 전환하여 확장성도 확보했습니다."
