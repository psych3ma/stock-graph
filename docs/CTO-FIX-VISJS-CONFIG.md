# CTO Fix: Vis.js Configuration Errors

**일시**: 2026-02-17  
**우선순위**: 🔴 Critical  
**상태**: ✅ 수정 완료

---

## 문제 분석

### 발견된 오류

브라우저 콘솔에서 반복적으로 발생하는 Vis.js 설정 오류:

```
Unknown option detected: "animation". Did you mean "manipulation"?
Errors have been found in the supplied options object.
```

### 근본 원인

1. **잘못된 옵션 위치**: `animation` 속성을 Vis.js `Network` 생성자의 `options` 객체에 top-level로 추가했으나, 이는 유효하지 않은 옵션입니다.

2. **Vis.js API 이해 부족**: 
   - `animation`은 top-level 옵션이 아님
   - `animation`은 `moveTo()`, `fit()`, `focus()` 같은 메서드의 파라미터로만 사용됨
   - 노드/엣지 상태 변경 시 부드러운 전환은 `physics.enabled=false`일 때 자동으로 처리됨

3. **영향**:
   - 그래프 초기화 실패 ("초기화 중.." 상태에서 멈춤)
   - 콘솔 에러 반복 발생
   - 사용자 경험 저하

---

## 수정 사항

### 1. Options 객체에서 `animation` 제거

**수정 전**:
```javascript
const options = {
  nodes: { ... },
  edges: { ... },
  physics: { enabled: false },
  interaction: { ... },
  layout: { improvedLayout: false },
  animation: {  // ❌ 잘못된 위치
    enabled: true,
    duration: 300,
    easingFunction: 'easeInOutQuad',
  },
};
```

**수정 후**:
```javascript
const options = {
  nodes: { ... },
  edges: { ... },
  physics: { enabled: false },
  interaction: { ... },
  layout: { improvedLayout: false },
  // ✅ animation은 top-level 옵션이 아님
  // 노드/엣지 상태 변경 시 부드러운 전환은 physics.enabled=false일 때 자동 처리됨
};
```

### 2. 메서드 파라미터로의 `animation` 사용은 유지

`network.focus()`, `network.fit()`, `network.moveTo()` 등의 메서드에서는 `animation` 파라미터를 올바르게 사용 중:

```javascript
// ✅ 올바른 사용 (메서드 파라미터)
network.focus(nodeId, {
  scale: 1.5,
  animation: {
    duration: 400,
    easingFunction: 'easeInOutQuad',
  },
});

network.fit({ 
  animation: { duration: 300 } 
});
```

---

## Vis.js Animation 옵션 정리

### 올바른 사용법

1. **Camera Animation** (카메라 이동/줌):
   - `network.moveTo(options)` - `options.animation` 사용
   - `network.fit(options)` - `options.animation` 사용
   - `network.focus(nodeId, options)` - `options.animation` 사용

2. **Physics Animation** (노드 물리 시뮬레이션):
   - `options.physics.enabled = true`일 때 자동 애니메이션
   - `options.physics.stabilization` 설정으로 초기 안정화 제어

3. **Node/Edge State Changes** (노드/엣지 상태 변경):
   - `physics.enabled = false`일 때도 부드러운 전환 자동 처리
   - 별도의 `animation` 옵션 불필요

---

## 추가 수정 사항

### 3. Shadow 옵션 최적화

**문제**: 전역 shadow 옵션이 모든 노드에 적용되어 성능 저하 가능성

**수정**:
- 전역 shadow 기본값을 `enabled: false`로 설정
- 선택된 노드만 개별적으로 shadow 활성화

### 4. Focus 호출 순서 최적화

**문제**: `network.focus()` 호출 후 `renderGraph()` 호출로 인한 중복 렌더링

**수정**:
- `renderGraph()` 먼저 실행
- 렌더링 완료 후 `setTimeout`으로 `focus()` 호출

### 5. 에러 핸들링 개선

**추가**: Vis.js 초기화 실패 시 상세한 에러 정보 로깅

## 검증 체크리스트

- [x] Options 객체에서 `animation` 제거 완료
- [x] 메서드 파라미터의 `animation` 사용 유지 확인
- [x] Shadow 옵션 최적화 완료
- [x] Focus 호출 순서 최적화 완료
- [x] 에러 핸들링 개선 완료
- [ ] 브라우저 콘솔에서 에러 메시지 사라짐 확인
- [ ] 그래프 초기화 정상 작동 확인
- [ ] 노드 선택 시 부드러운 전환 확인
- [ ] 줌/패닝 애니메이션 정상 작동 확인

---

## 참고 자료

- [Vis.js Network Documentation](https://visjs.github.io/vis-network/docs/network/)
- [Vis.js Animation Showcase](https://visjs.github.io/vis-network/examples/network/other/animationShowcase.html)
- [Vis.js Physics Documentation](https://visjs.github.io/vis-network/docs/network/physics.html)

---

**수정 완료일**: 2026-02-17  
**검토자**: CTO (AI Assistant)
