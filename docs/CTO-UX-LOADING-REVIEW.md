# CTO UX 전문가 관점: 로딩 화면 검토 및 개선

**검토 일자**: 2026-02-19  
**검토 기준**: 확장성, 유지보수성, 일관성, 호환성, 협업 코드  
**UX 전문가 관점**: 사용자 경험, 접근성, 명확성, 피드백

---

## 📊 현재 상태 분석

### 현재 로딩 화면 구성 요소

1. **Indeterminate Progress Spinner**
   - 원형 스피너 (40px)
   - 애니메이션: 0.8s linear infinite
   - 색상: 주황색 (`--pwc-orange`)

2. **메인 메시지**
   - 텍스트: "그래프 데이터 불러오는 중…"
   - 폰트: 14px, font-weight: 500
   - 색상: `--text-2` (중간 회색)

3. **가이던스 메시지**
   - 텍스트: "데이터가 많으면 1분까지 걸릴 수 있습니다"
   - 폰트: 12px
   - 색상: `--text-3` (연한 회색)
   - **개선 필요**: "최대 1분까지"로 변경

4. **단계 인디케이터**
   - 4단계: 서버 연결 → 데이터 조회 → 그래프 구성 → 완료
   - 상태: completed, active, pending
   - 시각적 피드백: 점(dot) + 연결선(line)

---

## 🎯 CTO 관점 검토 결과

### ✅ 강점

#### 1. **확장성** (Scalability)
- ✅ 단계 인디케이터가 동적으로 업데이트 가능
- ✅ 프로그레스바와 단계 인디케이터 분리로 유연한 구성
- ✅ 메시지가 JavaScript에서 동적으로 설정 가능

#### 2. **유지보수성** (Maintainability)
- ✅ 로딩 관련 코드가 `showGraphLoading()` 함수로 집중화
- ✅ CSS 변수 사용으로 디자인 토큰 관리 용이
- ✅ HTML 구조가 명확하게 분리됨

#### 3. **일관성** (Consistency)
- ✅ 디자인 토큰(`--pwc-orange`, `--text-2` 등) 사용
- ✅ 애니메이션 타이밍 일관성 (0.8s, 0.3s)
- ✅ 색상 시스템 일관성

#### 4. **호환성** (Compatibility)
- ✅ ARIA 속성 사용 (`aria-live`, `aria-busy`, `role="progressbar"`)
- ✅ CSS 애니메이션 호환성 (모든 주요 브라우저 지원)
- ✅ 접근성 고려 (스크린 리더 지원)

#### 5. **협업 코드** (Collaborative Code)
- ✅ 주석으로 구조 설명
- ✅ 명확한 ID 네이밍
- ✅ 함수명이 명확함

---

## ⚠️ 개선 필요 사항

### 1. **UX 개선** (High Priority)

#### 문제점
1. **텍스트 명확성**
   - "1분까지" → "최대 1분까지"로 변경 필요
   - 사용자가 "정확히 1분"으로 오해할 수 있음

2. **메시지 일관성**
   - 현재: "그래프 데이터 불러오는 중…"
   - 단계별로 다른 메시지가 표시되어야 함
   - 예: "서버 연결 중…", "데이터 조회 중…", "그래프 구성 중…"

3. **가이던스 메시지 표시 시점**
   - 현재: 항상 표시되는지 불명확
   - 권장: 데이터 양에 따라 조건부 표시

#### 개선 방안
```javascript
// 메시지 상수화 (유지보수성 향상)
const LOADING_MESSAGES = {
  connecting: {
    main: '서버 연결 중…',
    guidance: null
  },
  loadingData: {
    main: '그래프 데이터 불러오는 중…',
    guidance: '데이터가 많으면 최대 1분까지 걸릴 수 있습니다'
  },
  computingLayout: {
    main: '그래프 구성 중…',
    guidance: '노드 위치를 계산하고 있습니다'
  },
  rendering: {
    main: '렌더링 중…',
    guidance: null
  }
};
```

### 2. **확장성 개선** (Medium Priority)

#### 문제점
- 단계 수가 하드코딩되어 있음 (4단계)
- 새로운 단계 추가 시 HTML과 JavaScript 모두 수정 필요

#### 개선 방안
```javascript
// 단계 정의를 데이터 구조로 분리
const LOADING_STEPS = [
  { id: 'connect', label: '서버 연결' },
  { id: 'query', label: '데이터 조회' },
  { id: 'layout', label: '그래프 구성' },
  { id: 'complete', label: '완료' }
];

// 동적으로 HTML 생성
function renderLoadingSteps() {
  const stepsEl = document.getElementById('loadingSteps');
  if (!stepsEl) return;
  
  stepsEl.innerHTML = LOADING_STEPS.map((step, idx) => `
    <div class="step-item" data-step-id="${step.id}" aria-label="${step.label}">
      <div class="step-dot"></div>
      <span class="step-label">${step.label}</span>
      ${idx < LOADING_STEPS.length - 1 ? '<div class="step-line"></div>' : ''}
    </div>
  `).join('');
}
```

### 3. **유지보수성 개선** (Medium Priority)

#### 문제점
- 메시지가 여러 곳에 분산되어 있음
- 텍스트 변경 시 여러 파일 수정 필요

#### 개선 방안
```javascript
// 메시지 중앙 관리
const LOADING_CONFIG = {
  messages: {
    default: 'UI 구성 중…',
    connecting: '서버 연결 중…',
    loadingData: '그래프 데이터 불러오는 중…',
    computingLayout: '그래프 구성 중…',
    rendering: '렌더링 중…'
  },
  guidance: {
    longDataLoad: '데이터가 많으면 최대 1분까지 걸릴 수 있습니다',
    computingLayout: '노드 위치를 계산하고 있습니다'
  },
  steps: [
    { id: 'connect', label: '서버 연결' },
    { id: 'query', label: '데이터 조회' },
    { id: 'layout', label: '그래프 구성' },
    { id: 'complete', label: '완료' }
  ]
};
```

### 4. **일관성 개선** (Low Priority)

#### 문제점
- 단계 인디케이터의 초기 상태가 모두 "completed"로 설정됨
- 실제 진행 상태와 불일치 가능성

#### 개선 방안
```javascript
// 초기 상태를 "pending"으로 설정
function initializeLoadingSteps() {
  const stepsEl = document.getElementById('loadingSteps');
  if (!stepsEl) return;
  
  const stepItems = stepsEl.querySelectorAll('.step-item');
  stepItems.forEach(item => {
    item.classList.remove('completed', 'active');
  });
}
```

### 5. **호환성 개선** (Low Priority)

#### 문제점
- 프로그레스바의 indeterminate 모드가 항상 활성화되지 않음
- 진행률이 없을 때 빈 프로그레스바가 표시될 수 있음

#### 개선 방안
```javascript
// 프로그레스바 표시 조건 개선
if (progressPercent === null) {
  // Indeterminate 모드
  progressEl.style.animation = 'loading-progress-indeterminate 2s ease-in-out infinite';
  progressContainer.setAttribute('aria-label', '로딩 중...');
} else {
  // Determinate 모드
  progressEl.style.animation = 'none';
  progressEl.style.width = `${progressPercent}%`;
  progressContainer.setAttribute('aria-valuenow', progressPercent);
  progressContainer.setAttribute('aria-label', `진행률: ${progressPercent}%`);
}
```

---

## 🔧 즉시 적용할 개선 사항

### 1. 텍스트 변경: "1분까지" → "최대 1분까지"

**위치**: `graph.js`의 `showGraphLoading()` 호출 부분

**변경 전**:
```javascript
showGraphLoading('그래프 데이터 불러오는 중...', '데이터가 많으면 1분까지 걸릴 수 있습니다', 25, 1);
```

**변경 후**:
```javascript
showGraphLoading('그래프 데이터 불러오는 중...', '데이터가 많으면 최대 1분까지 걸릴 수 있습니다', 25, 1);
```

### 2. 메시지 상수화 (선택적, 권장)

**위치**: `graph.js` 상단에 상수 정의 추가

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// LOADING MESSAGES CONFIG (CTO: 메시지 중앙 관리)
// ═══════════════════════════════════════════════════════════════════════════
const LOADING_MESSAGES = {
  connecting: {
    main: '서버 연결 중…',
    guidance: null
  },
  loadingData: {
    main: '그래프 데이터 불러오는 중…',
    guidance: '데이터가 많으면 최대 1분까지 걸릴 수 있습니다'
  },
  computingLayout: {
    main: '그래프 구성 중…',
    guidance: '노드 위치를 계산하고 있습니다'
  },
  rendering: {
    main: '렌더링 중…',
    guidance: null
  }
};
```

### 3. 단계 인디케이터 초기화 개선

**위치**: `hideGraphLoading()` 함수

```javascript
function hideGraphLoading() {
  const overlay = document.getElementById('loadingOverlay');
  const stepsEl = document.getElementById('loadingSteps');
  
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-busy', 'false');
  }
  
  // CTO: 모든 단계 완료 처리 및 다음 로딩을 위한 초기화
  if (stepsEl) {
    const stepItems = stepsEl.querySelectorAll('.step-item');
    stepItems.forEach(item => {
      item.classList.add('completed');
      item.classList.remove('active');
    });
  }
}
```

---

## 📋 CTO 검토 체크리스트

### 즉시 적용
- [x] 텍스트 변경: "1분까지" → "최대 1분까지"
- [ ] 메시지 상수화 (선택적)
- [ ] 단계 인디케이터 초기화 개선

### 단기 개선 (이번 주)
- [ ] 메시지 중앙 관리 시스템 구축
- [ ] 단계 정의 데이터 구조화
- [ ] 프로그레스바 표시 조건 개선

### 중기 개선 (이번 달)
- [ ] 다국어 지원 준비 (i18n)
- [ ] 로딩 시간 통계 수집
- [ ] 사용자 피드백 수집 시스템

---

## 🎨 UX 전문가 관점 추가 개선 제안

### 1. **시각적 피드백 강화**
- 단계 전환 시 부드러운 애니메이션 추가
- 프로그레스바가 실제 진행률을 반영하도록 개선

### 2. **접근성 강화**
- 스크린 리더에서 단계별 진행 상황을 더 명확하게 전달
- 키보드 네비게이션 지원 (필요시)

### 3. **사용자 경험 개선**
- 예상 소요 시간을 더 정확하게 표시
- 취소 버튼 추가 (필요시)

---

## 📌 요약

### 현재 상태
- ✅ 기본적인 로딩 화면 구조는 잘 설계됨
- ✅ 접근성 고려 사항 포함
- ⚠️ 텍스트 명확성 개선 필요 ("최대 1분까지")
- ⚠️ 메시지 관리 체계화 필요

### 우선순위
1. **P0 (즉시)**: 텍스트 변경 ("최대 1분까지")
2. **P1 (이번 주)**: 메시지 상수화, 단계 인디케이터 개선
3. **P2 (이번 달)**: 확장성 개선, 다국어 지원 준비

### 예상 효과
- 사용자 혼란 감소 (명확한 시간 안내)
- 유지보수성 향상 (메시지 중앙 관리)
- 확장성 향상 (단계 추가 용이)
