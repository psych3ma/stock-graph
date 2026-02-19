# CTO Fix: 노드 선택 후 줌 기능 문제 해결

**검토자**: 프론트엔드 출신 CTO 전문가  
**검토 일자**: 2026-02-19  
**이슈**: 초기 화면에서는 줌 기능이 정상 작동하지만, 노드 선택 후에는 줌 기능이 제대로 작동하지 않음

---

## 🔍 문제 분석

### 발견된 문제

1. **노드 선택 후 줌 비활성화**: 노드를 선택한 후 Ctrl/Cmd + 휠로 줌이 작동하지 않음
2. **Physics 재활성화 간섭**: 노드 선택 후 `renderGraph()` 호출 시 `physics: true`로 재설정되어 줌 상태 꼬임
3. **수동 휠 핸들러 누락**: 이전에 추가한 수동 휠 이벤트 핸들러가 코드에서 누락됨
4. **`zoomView: true` 활성화**: 자동 줌이 여전히 활성화되어 수동 휠 처리와 충돌

### 근본 원인

1. **코드 불일치**: 이전 수정사항이 일부만 반영되어 `zoomView: true`가 여전히 활성화
2. **Physics 재활성화**: 노드 선택 후 `renderGraph()` 호출 시 physics가 재활성화되어 안정화 시작 → 줌 간섭
3. **이벤트 핸들러 중복/누락**: 수동 휠 핸들러가 제대로 바인딩되지 않음

---

## ✅ 해결 방법

### 1. `zoomView: false` 설정 복원

**변경사항**:
- `interaction.zoomView: false`로 변경하여 자동 줌 비활성화
- `zoomKey: 'ctrlKey'` 설정 추가

**코드 위치**: `frontend/graph.js:1970-1975`

```javascript
interaction: {
  dragNodes: true,
  zoomView: false, // 수동 휠 이벤트 처리로 변경
  dragView: true,
  zoomKey: 'ctrlKey', // Ctrl/Cmd 키와 함께 휠 스크롤 시에만 줌
  hover: true,
}
```

### 2. 수동 휠 이벤트 핸들러 추가

**변경사항**:
- 컨테이너에 직접 휠 이벤트 리스너 추가
- Ctrl/Cmd + 휠 = 줌, 일반 휠 = 팬
- 안정화 중에는 팬 비활성화

**코드 위치**: `frontend/graph.js:1990-2040`

```javascript
// 수동 휠 이벤트 처리
if (visNetwork && !visNetwork._wheelHandlerAdded) {
  const container = document.getElementById('visNetwork');
  if (container) {
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      // Ctrl/Cmd + 휠 = 줌
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const currentScale = visNetwork.getScale();
        const newScale = Math.max(0.3, Math.min(3, currentScale * delta));
        
        const pointer = visNetwork.getViewPosition();
        visNetwork.moveTo({
          position: pointer,
          scale: newScale,
          animation: false,
        });
        return;
      }
      
      // 일반 휠 = 팬 (안정화 중 비활성화)
      const physicsEnabled = visNetwork.getOptions().physics?.enabled;
      if (physicsEnabled) return;
      
      const panSpeed = 0.5;
      const currentView = visNetwork.getViewPosition();
      visNetwork.moveTo({
        position: {
          x: currentView.x - e.deltaX * panSpeed,
          y: currentView.y - e.deltaY * panSpeed,
        },
        animation: false,
      });
    }, { passive: false });
    
    visNetwork._wheelHandlerAdded = true;
  }
}
```

### 3. 노드 선택 시 Physics 재활성화 방지

**변경사항**:
- 노드 선택 중에는 `renderGraph()` 호출 시 physics 재활성화하지 않음
- 줌 상태 유지

**코드 위치**: `frontend/graph.js:2004-2011`

```javascript
if (visNetwork) {
  visNetwork.setData(data);
  visNetwork.setOptions(options);
  // 노드 선택 중이면 physics 재활성화 안 함 (줌 상태 유지)
  const shouldReenablePhysics = !selectedNodeId;
  if (shouldReenablePhysics) {
    visNetwork.setOptions({ physics: true });
  }
}
```

### 4. 줌 이벤트 핸들러에서 Physics 상태 보존

**변경사항**:
- 줌 이벤트 핸들러에서 `renderGraph()` 호출 시 physics 상태 보존
- 안정화 완료 후에는 physics: false 유지

**코드 위치**: `frontend/graph.js:2040-2055`

```javascript
visNetwork.on("zoom", () => {
  if (zoomTimeout) clearTimeout(zoomTimeout);
  zoomTimeout = setTimeout(() => {
    const currentPhysics = visNetwork.getOptions().physics?.enabled;
    renderGraph();
    // Physics 상태 복원 (안정화 완료 후에는 false 유지)
    if (!currentPhysics && visNetwork) {
      visNetwork.setOptions({ physics: false });
    }
  }, 150);
});
```

---

## 📊 개선 효과

### Before (문제 상황)

- ❌ 노드 선택 후 Ctrl/Cmd + 휠 → 줌 작동 안 함
- ❌ 노드 선택 후 일반 휠 → 이상한 곳으로 이동
- ❌ `renderGraph()` 호출 시 physics 재활성화로 줌 상태 꼬임

### After (개선 후)

- ✅ **노드 선택 후에도 Ctrl/Cmd + 휠 = 줌 정상 작동**
- ✅ **노드 선택 후 일반 휠 = 팬 정상 작동**
- ✅ **노드 선택 중 physics 재활성화 방지 (줌 상태 유지)**

---

## 🎯 사용자 가이드

### 노드 선택 후 줌 방법

1. **노드 선택**: 노드 클릭
2. **줌**: **Ctrl (Windows) / Cmd (Mac) + 마우스 휠**
3. **팬**: 일반 마우스 휠 (Ctrl/Cmd 없이)
4. **선택 해제**: 빈 공간 클릭

---

## 🔧 기술적 세부사항

### 호환성 (Compatibility)

- ✅ **브라우저 호환성**: 모든 모던 브라우저 지원
- ✅ **플랫폼 호환성**: Windows, macOS, Linux
- ✅ **입력 장치**: 마우스, 터치패드

### 일관성 (Consistency)

- ✅ **일관된 동작**: 초기 화면과 노드 선택 후 동일한 줌 동작
- ✅ **예측 가능성**: 사용자가 의도한 동작만 실행

### 유지보수성 (Maintainability)

- ✅ **명확한 로직**: 노드 선택 상태에 따른 조건부 처리
- ✅ **이벤트 기반**: Vis.js 이벤트와 DOM 이벤트 조합

### 확장성 (Scalability)

- ✅ **성능 최적화**: 노드 선택 중 불필요한 physics 재활성화 방지
- ✅ **사용자 경험**: 줌 상태 유지로 부드러운 인터랙션

### 협업 코드 (Collaborative Code)

- ✅ **명확한 주석**: 각 설정의 목적과 조건 명시
- ✅ **CTO 관점 주석**: 프론트엔드 전문가 관점에서의 설명

---

## 📝 관련 파일

- `frontend/graph.js`: 수동 휠 이벤트 처리, 노드 선택 시 physics 재활성화 방지

---

## ✅ 검증 체크리스트

- [x] 초기 화면에서 Ctrl/Cmd + 휠 → 줌 작동
- [x] 노드 선택 후 Ctrl/Cmd + 휠 → 줌 작동
- [x] 노드 선택 후 일반 휠 → 팬 작동
- [x] 노드 선택 중 physics 재활성화 방지
- [x] 줌 이벤트 핸들러에서 physics 상태 보존
