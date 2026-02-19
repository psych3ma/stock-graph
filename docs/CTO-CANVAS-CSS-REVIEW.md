# 디자이너 출신 CTO 관점: 캔버스 CSS 검토 및 통합

**검토 일자**: 2026-02-19  
**검토 기준**: 확장성, 유지보수성, 일관성, 호환성, 협업 코드  
**디자이너 관점**: 시각적 품질, 사용자 경험, 인터랙션, 디자인 시스템

---

## 📊 타 서비스 CSS 분석

### 주요 특징

#### 1. **그래프 영역 (Graph Canvas)**
- ✅ `min-width: 0` - Flex 리플로우 안정화
- ✅ `touch-action: none` - 터치 스크롤 방지, 줌/팬만 그래프에 적용
- ✅ `user-select: none` - 텍스트 선택 방지
- ✅ 세련된 배경 그라데이션 (타원형, 다중 레이어)

#### 2. **Vis.js 컨테이너**
- ✅ `touch-action: none` - 터치 이벤트 제어
- ✅ 투명 배경 강제 (`!important`)

#### 3. **로딩 오버레이**
- ✅ 에러 상태 스타일 (`.error-state`)
- ✅ Indeterminate 프로그레스바 스타일
- ✅ 부드러운 전환 (`opacity` 기반)

#### 4. **툴팁**
- ✅ 더 큰 패딩 (10px 13px)
- ✅ 더 큰 그림자 (더 깊은 느낌)
- ✅ `.visible` 클래스 기반 표시/숨김

#### 5. **줌 컨트롤**
- ✅ `grid` 레이아웃 사용 (`place-items: center`)
- ✅ 호버 시 색상 변경 (accent 색상)
- ✅ 더 큰 크기 (34px)

#### 6. **그래프 통계**
- ✅ 새로운 스타일 (`.stat-pill`)
- ✅ 모노스페이스 폰트
- ✅ 강조 색상 (`strong` 태그)

#### 7. **범례**
- ✅ 위치 개선 (줌 컨트롤 위)
- ✅ `calc()` 사용으로 동적 위치 계산
- ✅ 노드 타입별 색상 변수 (`--c-company` 등)
- ✅ `muted` 상태 지원

---

## 🎯 CTO 관점 검토 결과

### ✅ 강점

#### 1. **확장성** (Scalability)
- ✅ 에러 상태 스타일 분리
- ✅ Indeterminate 프로그레스바 지원
- ✅ 다양한 상태 클래스 (`.muted`, `.error-state`)

#### 2. **유지보수성** (Maintainability)
- ✅ 명확한 CSS 변수 사용 (`--canvas-*`, `--accent`, `--error`)
- ✅ 노드 타입별 색상 변수 (`--c-company` 등)
- ✅ 일관된 네이밍 컨벤션

#### 3. **일관성** (Consistency)
- ✅ 디자인 토큰 기반 스타일링
- ✅ 일관된 간격 및 크기
- ✅ 일관된 전환 효과

#### 4. **호환성** (Compatibility)
- ✅ 터치 이벤트 제어 (`touch-action: none`)
- ✅ Flex 리플로우 안정화 (`min-width: 0`)
- ✅ 반응형 고려 (`calc()` 사용)

#### 5. **협업 코드** (Collaborative Code)
- ✅ 명확한 주석
- ✅ 의미 있는 클래스명
- ✅ 상태 기반 스타일링

---

## 🔧 통합 개선 사항

### 1. 그래프 영역 개선

**현재**:
```css
.graph-area {
  flex: 1; position: relative; overflow: hidden;
  background: var(--bg);
  background-image: ...
}
```

**개선**:
```css
.graph-area {
  flex: 1; position: relative; overflow: hidden;
  min-width: 0; /* CTO: Flex 리플로우 안정화 */
  /* CTO: 그래프와 마우스/터치/스크롤 싱크 */
  touch-action: none;
  user-select: none;
  background: /* 개선된 그라데이션 */
}
```

### 2. Vis.js 컨테이너 개선

**현재**:
```css
#visNetwork {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  display: block;
}
```

**개선**:
```css
#visNetwork {
  width: 100%; height: 100%;
  background: transparent !important;
  touch-action: none;
}
#visNetwork canvas {
  background: transparent !important;
}
```

### 3. 로딩 오버레이 에러 상태 추가

**추가 필요**:
```css
.loading-overlay.error-state {
  background: rgba(250,248,245,.98);
}
.loading-overlay.error-state .loading-text {
  color: var(--error);
}
.loading-overlay.error-state .loading-spinner {
  border-top-color: var(--error);
  animation: none;
}
```

### 4. Indeterminate 프로그레스바 추가

**추가 필요**:
```css
.loading-progress.indeterminate .loading-bar {
  width: 100% !important;
  background: linear-gradient(...);
  animation: indeterminate-progress 1.5s ease-in-out infinite;
}
```

### 5. 툴팁 개선

**현재**:
```css
#graphTooltip {
  display: none;
  /* 기본 스타일 */
}
```

**개선**:
```css
#graphTooltip {
  opacity: 0;
  transition: opacity .15s;
  /* 개선된 스타일 */
}
#graphTooltip.visible {
  opacity: 1;
}
```

### 6. 줌 컨트롤 개선

**개선**:
```css
.zoom-btn {
  display: grid; place-items: center; /* 더 정확한 중앙 정렬 */
  /* 호버 시 accent 색상 */
}
```

### 7. 그래프 통계 추가

**새로 추가**:
```css
.graph-stats {
  position: absolute; left: 16px; top: 12px;
  display: flex; gap: 6px;
}
.stat-pill {
  /* 통계 표시용 스타일 */
}
```

### 8. 범례 위치 및 스타일 개선

**개선**:
```css
.graph-legend {
  position: absolute;
  left: 16px;
  bottom: calc(34px * 3 + 4px * 2 + 24px); /* 동적 위치 */
  /* 개선된 스타일 */
}
.legend-row.muted {
  opacity: .3;
}
```

---

## 📋 CSS 변수 매핑

### ✅ 적용 완료된 변수

```css
:root {
  /* 에러 색상 */
  --error: var(--pwc-red);
  
  /* 노드 타입별 색상 (범례용) */
  --c-company: var(--node-company);
  --c-person: var(--node-person);
  --c-major: var(--node-major);
  --c-institution: var(--node-institution);
  
  /* Canvas 서피스 변형 */
  --canvas-surf2: var(--surface-2);
}
```

**위치**: `graph.css`의 `:root` 블록에 추가됨

---

## 🎨 디자이너 관점 개선사항

### 1. 시각적 계층 구조
- ✅ 더 깊은 그림자 (툴팁)
- ✅ 더 부드러운 그라데이션 (배경)
- ✅ 명확한 상태 구분 (에러, muted)

### 2. 인터랙션 개선
- ✅ 터치 이벤트 제어
- ✅ 텍스트 선택 방지
- ✅ 부드러운 전환 효과

### 3. 레이아웃 안정성
- ✅ Flex 리플로우 안정화
- ✅ 동적 위치 계산
- ✅ 반응형 고려

---

## 📌 통합 우선순위

### P0 (즉시 적용)
1. ✅ `min-width: 0` 추가 (Flex 안정화)
2. ✅ `touch-action: none` 추가 (터치 제어)
3. ✅ `user-select: none` 추가 (텍스트 선택 방지)
4. ✅ 에러 상태 스타일 추가
5. ✅ Indeterminate 프로그레스바 추가

### P1 (이번 주)
1. ✅ 툴팁 스타일 개선
2. ✅ 줌 컨트롤 개선
3. ✅ 범례 위치 개선
4. ✅ 그래프 통계 스타일 추가

### P2 (이번 달)
1. ⚠️ 배경 그라데이션 개선 (타원형)
2. ⚠️ 노드 타입별 색상 변수 추가

---

## 🔗 관련 문서

- [로딩 CSS Variant 검토](./CTO-DESIGNER-CSS-REVIEW.md)
- [마이그레이션 문서](./CTO-MIGRATION-VISJS-HTML.md)
