# 노드 겹침 및 렌더링 모드 전환 문제 해결

## 문제 진단

1. **SVG가 Vis.js 위에 표시됨**: `useVisJs: true` 설정에도 SVG가 활성화되어 Vis.js가 가려짐
2. **노드 겹침**: 4,919개 노드가 한 곳에 몰려 가독성 저하
3. **렌더링 모드 전환 실패**: CSS 우선순위로 인해 JS로 `display:none`이 무시됨

---

## 해결 내역

### 1. CSS: 렌더링 모드 전환 강화

**변경 파일**: `frontend/graph.css`

```css
/* SVG와 Vis.js 컨테이너 명시적 제어 */
#graphSvg {
  display: block; /* 기본값 */
  position: relative;
  z-index: 1;
}
#graphSvg.hidden {
  display: none !important;
  visibility: hidden;
  pointer-events: none;
}

#visNetworkContainer {
  position: absolute;
  z-index: 2; /* SVG 위에 표시 */
  display: none; /* 기본값 */
}
#visNetworkContainer.visible {
  display: block !important;
  visibility: visible;
  pointer-events: auto;
}
```

**효과**: `!important`와 클래스 기반 전환으로 CSS 우선순위 문제 해결

---

### 2. JS: Vis.js 초기화 안전성 강화

**변경 파일**: `frontend/graph.js`

- **Vis.js 라이브러리 로드 확인**: `typeof vis === 'undefined'` 체크
- **자동 폴백**: Vis.js 로드 실패 시 SVG로 자동 전환
- **렌더링 모드 전환 로직 강화**: 클래스 기반 전환 (`hidden`/`visible`)

```javascript
// Vis.js 라이브러리 로드 확인
if (typeof vis === 'undefined' || !vis.Network) {
  console.error('Vis.js not loaded, falling back to SVG');
  GRAPH_CONFIG.useVisJs = false;
  renderGraph(); // SVG로 재렌더링
  return;
}

// 렌더링 모드 전환
container.classList.add('visible');
svg.classList.add('hidden');
```

---

### 3. 노드 겹침 방지 개선

**변경 파일**: `frontend/graph.js`

#### 초기 배치 반경 확대
- 컴포넌트별 배치: `minRadiusByCount = comp.length * 24` (기존 16)
- 단일 컴포넌트: `radiusX/Y = allNodes.length * 12` (기존 8)

#### 반발력 강화
- `repulsionStrength: 350` (기존 280)
- `collisionRadiusMultiplier: 4.0` (기존 3.5)
- `repulsionOnlyIter: 250` (기존 180) - 반발 워밍업 확대

**효과**: 노드가 많아도 초기 배치부터 넓게 분산, 반발력으로 겹침 방지

---

## 검증 방법

1. **Vis.js 활성화 확인**
   - 브라우저 개발자 도구 → Elements → `#visNetworkContainer.visible` 확인
   - `#graphSvg.hidden` 확인

2. **노드 겹침 확인**
   - 그래프 로드 후 노드들이 넓게 분산되는지 확인
   - 드래그로 노드 이동 시 겹치지 않고 분리되는지 확인

3. **폴백 동작 확인**
   - 네트워크 탭에서 Vis.js CDN 로드 실패 시뮬레이션
   - SVG로 자동 전환되는지 확인

---

## 협업 코드 고려사항

- **명시적 전환 로직**: CSS 클래스 기반으로 렌더링 모드 전환 명확화
- **자동 폴백**: Vis.js 실패 시 SVG로 자동 전환하여 안정성 확보
- **설정 기반 동작**: `GRAPH_CONFIG.useVisJs`로 렌더링 모드 제어

---

**CTO 메시지**: "렌더링 모드 전환 문제와 노드 겹침을 해결하여 가독성과 사용자 경험을 개선했습니다."
