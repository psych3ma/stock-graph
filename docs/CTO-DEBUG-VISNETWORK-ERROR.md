# CTO 디버깅 가이드: visNetworkContainer Element Not Found

**에러 발생일**: 2026-02-19  
**에러 메시지**: `graph.js:1261 visNetworkContainer element not found`  
**상태**: 그래프 데이터는 로드되었으나 렌더링 실패

---

## 🔍 문제 분석

### 증상
- 그래프 데이터 로드 완료: 노드 267개, 엣지 200개
- 노드 타입별 개수 정상 표시
- **Vis.js 렌더링 실패**: `visNetworkContainer element not found`

### 근본 원인 (CTO 관점)

#### 1. **호환성 문제** ⚠️
- **브라우저 캐시**: 이전 버전의 JavaScript 파일이 캐시되어 사용됨
- **ID 불일치**: 코드는 `visNetwork`로 업데이트되었으나, 브라우저는 이전 `visNetworkContainer`를 찾음
- **타이밍 이슈**: DOM이 완전히 로드되기 전에 JavaScript 실행 가능성

#### 2. **일관성 문제** ⚠️
- 마이그레이션 과정에서 일부 참조가 누락되었을 가능성
- 에러 메시지가 명확하지 않아 디버깅 어려움

#### 3. **유지보수성 문제** ⚠️
- 에러 처리 로직이 충분하지 않음
- 디버깅 정보 부족

---

## 🛠️ 즉시 수정 사항

### 1. 에러 처리 강화 및 디버깅 정보 추가

```javascript
// graph.js의 renderGraphWithVisJs 함수 개선
function renderGraphWithVisJs() {
  // ... 기존 코드 ...
  
  // CTO: ID 변경 (visNetworkContainer → visNetwork)
  // CTO: 호환성 - 이전 ID도 확인하여 명확한 에러 메시지 제공
  let container = document.getElementById('visNetwork');
  
  if (!container) {
    // CTO: 디버깅 정보 강화
    const legacyContainer = document.getElementById('visNetworkContainer');
    const graphArea = document.getElementById('graphArea');
    
    console.error('Vis.js 컨테이너를 찾을 수 없습니다:', {
      expectedId: 'visNetwork',
      legacyIdFound: !!legacyContainer,
      graphAreaExists: !!graphArea,
      allGraphAreaChildren: graphArea ? Array.from(graphArea.children).map(c => ({
        id: c.id,
        className: c.className,
        tagName: c.tagName
      })) : null
    });
    
    updateStatus('그래프 컨테이너를 찾을 수 없습니다', false);
    
    // CTO: 자동 복구 시도 (레거시 ID가 있으면 사용)
    if (legacyContainer) {
      console.warn('레거시 ID visNetworkContainer 발견, 자동 복구 시도');
      container = legacyContainer;
    } else {
      return;
    }
  }
  
  // ... 나머지 코드 ...
}
```

### 2. DOM 준비 상태 확인 강화

```javascript
// DOM이 완전히 로드되었는지 확인하는 함수 추가
function ensureDOMReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve);
    } else {
      resolve();
    }
  });
}

// loadGraph 함수 시작 부분에 추가
async function loadGraph() {
  // CTO: DOM 준비 상태 확인
  await ensureDOMReady();
  
  // CTO: 컨테이너 존재 확인
  const container = document.getElementById('visNetwork');
  if (!container) {
    console.error('초기화 시점에 visNetwork 컨테이너를 찾을 수 없습니다');
    updateStatus('그래프 영역 초기화 실패', false);
    return;
  }
  
  // ... 기존 코드 ...
}
```

### 3. 브라우저 캐시 문제 해결

#### HTML에 캐시 버스팅 추가
```html
<!-- graph.html의 script 태그에 버전 파라미터 추가 -->
<script src="graph.js?v=20260219" defer></script>
```

#### 서버 설정 (향후)
- HTTP 헤더에 `Cache-Control: no-cache` 추가
- 또는 빌드 시 해시 기반 파일명 사용

---

## 🔧 수정 코드 적용

### 수정 1: renderGraphWithVisJs 함수 개선

```javascript
function renderGraphWithVisJs() {
  // Vis.js 렌더링 (PyGraphviz 좌표 + 부드러운 UX)
  if (NODES.length === 0 || Object.keys(positions).length === 0) {
    console.warn('renderGraphWithVisJs: positions not initialized yet');
    return;
  }
  
  // CTO: Vis.js 라이브러리 로드 확인 (필수)
  if (typeof vis === 'undefined' || !vis.Network) {
    console.error('Vis.js not loaded. This should not happen if waitForVisJs() worked correctly.');
    updateStatus('Vis.js 라이브러리 로드 실패', false);
    return;
  }
  
  // CTO: ID 변경 (visNetworkContainer → visNetwork)
  // CTO: 호환성 및 디버깅 강화
  let container = document.getElementById('visNetwork');
  
  if (!container) {
    // CTO: 상세한 디버깅 정보 제공
    const graphArea = document.getElementById('graphArea');
    const legacyContainer = document.getElementById('visNetworkContainer');
    const allContainers = graphArea ? Array.from(graphArea.querySelectorAll('[id*="vis"], [id*="network"], [id*="graph"]')) : [];
    
    console.error('Vis.js 컨테이너를 찾을 수 없습니다:', {
      expectedId: 'visNetwork',
      legacyIdFound: !!legacyContainer,
      graphAreaExists: !!graphArea,
      graphAreaChildren: graphArea ? Array.from(graphArea.children).map(c => ({
        id: c.id,
        className: c.className,
        tagName: c.tagName
      })) : [],
      similarContainers: allContainers.map(c => ({
        id: c.id,
        className: c.className
      }))
    });
    
    updateStatus('그래프 컨테이너를 찾을 수 없습니다 - 페이지를 새로고침해주세요', false);
    
    // CTO: 자동 복구 시도 (레거시 ID가 있으면 사용)
    if (legacyContainer) {
      console.warn('레거시 ID visNetworkContainer 발견, 자동 복구 시도');
      container = legacyContainer;
    } else {
      // CTO: 사용자에게 명확한 안내
      const errorMsg = '그래프 컨테이너가 없습니다. 페이지를 새로고침하거나 개발자에게 문의하세요.';
      console.error(errorMsg);
      return;
    }
  }
  
  // ... 나머지 코드는 동일 ...
}
```

### 수정 2: DOM 준비 상태 확인

```javascript
// DOM 준비 상태 확인 함수 추가
function ensureDOMReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve);
    } else if (document.readyState === 'interactive' || document.readyState === 'complete') {
      resolve();
    } else {
      // 안전장치: 최대 5초 대기
      setTimeout(resolve, 5000);
    }
  });
}

// loadGraph 함수 시작 부분 수정
async function loadGraph() {
  try {
    // CTO: DOM 준비 상태 확인
    await ensureDOMReady();
    
    // CTO: 컨테이너 존재 사전 확인
    const container = document.getElementById('visNetwork');
    if (!container) {
      console.error('초기화 시점에 visNetwork 컨테이너를 찾을 수 없습니다');
      console.error('DOM 상태:', {
        readyState: document.readyState,
        graphAreaExists: !!document.getElementById('graphArea'),
        allIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id)
      });
      updateStatus('그래프 영역 초기화 실패 - 페이지를 새로고침해주세요', false);
      return;
    }
    
    // ... 기존 코드 계속 ...
  } catch (e) {
    // ... 기존 에러 처리 ...
  }
}
```

---

## 📋 CTO 검토 체크리스트

### 즉시 조치 필요
- [x] 에러 처리 강화 (상세한 디버깅 정보)
- [x] DOM 준비 상태 확인 추가
- [x] 자동 복구 로직 추가 (레거시 ID 지원)
- [ ] 브라우저 캐시 버스팅 추가
- [ ] 사용자 친화적 에러 메시지

### 단기 개선 (이번 주)
- [ ] 에러 로깅 시스템 구축 (Sentry 등)
- [ ] 자동 테스트 추가 (DOM 준비 상태 확인)
- [ ] 성능 모니터링 (렌더링 시간 측정)

### 중기 개선 (이번 달)
- [ ] 빌드 시스템 도입 (해시 기반 파일명)
- [ ] 에러 복구 자동화 강화
- [ ] 사용자 피드백 수집 시스템

---

## 🎯 예상 결과

수정 후:
1. **명확한 에러 메시지**: 문제 원인을 쉽게 파악 가능
2. **자동 복구**: 레거시 ID가 있으면 자동으로 사용
3. **디버깅 용이**: 상세한 로그로 문제 추적 가능
4. **사용자 경험 개선**: 명확한 안내 메시지 제공

---

## 🔗 관련 문서

- [마이그레이션 문서](./CTO-MIGRATION-VISJS-HTML.md)
- [Vis.js 공식 문서](https://visjs.github.io/vis-network/docs/network/)
