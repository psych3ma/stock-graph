# Git 커밋 가이드

**일시**: 2026-02-17  
**목적**: 변경사항을 체계적으로 커밋하기 위한 가이드

---

## 1단계: 현재 상태 확인

```bash
# 현재 디렉토리로 이동
cd /Users/coruscatio/Desktop/demo/stock-graph

# Git 상태 확인
git status

# 변경된 파일 목록 확인
git status --short

# 변경사항 상세 확인 (선택적)
git diff
```

---

## 2단계: 변경사항 검토

### 주요 변경 파일 확인

```bash
# 특정 파일의 변경사항 확인
git diff frontend/graph.js
git diff frontend/graph.css
git diff backend/app/api/v1/endpoints/graph.py

# 문서 파일 변경사항 확인
git diff docs/
```

---

## 3단계: 스테이징 (Staging)

### 옵션 1: 모든 변경사항 스테이징 (권장하지 않음)

```bash
git add .
```

### 옵션 2: 논리적 그룹별로 스테이징 (권장) ⭐

#### 그룹 1: Critical Fixes (핵심 버그 수정)

```bash
# Vis.js 설정 오류 수정
git add frontend/graph.js

# Vis.js 설정 문서
git add docs/CTO-FIX-VISJS-CONFIG.md
```

#### 그룹 2: UX 개선 (가독성 및 사용성)

```bash
# 엣지 라벨 포맷팅 개선
git add frontend/graph.js

# 노드 색상 일관성 개선
git add frontend/graph.js

# UX 문서
git add docs/UX-CTO-REVIEW-DENSE-GRAPH.md
git add docs/UX-CTO-EDGE-LABEL-FIX.md
git add docs/UX-CTO-COMPREHENSIVE-FIX.md
```

#### 그룹 3: 성능 최적화

```bash
# 초기 뷰 제한 및 레이아웃 파라미터 강화
git add frontend/graph.js

# 성능 관련 문서
git add docs/CTO-CRITICAL-FIX-DENSE-GRAPH.md
```

#### 그룹 4: 노드 크기 개선

```bash
# 데이터 기반 동적 크기 계산
git add frontend/graph.js

# 노드 크기 검토 문서
git add docs/CTO-NODE-SIZE-REVIEW.md
```

#### 그룹 5: 문서 및 테스트

```bash
# 테스트 결과 보고서
git add docs/TEST-RESULTS-REPORT.md

# QA 검토 문서
git add docs/QA-REVIEW-CRITICAL-ISSUES.md
```

---

## 4단계: 커밋 메시지 작성

### 커밋 메시지 형식 (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 종류

- `fix`: 버그 수정
- `feat`: 새로운 기능
- `refactor`: 리팩토링
- `perf`: 성능 개선
- `docs`: 문서 변경
- `style`: 코드 스타일 변경 (포맷팅 등)
- `test`: 테스트 추가/수정
- `chore`: 빌드/설정 변경

---

## 5단계: 커밋 실행

### 예시 커밋 메시지들

#### 커밋 1: Critical Fix - Vis.js 설정 오류

```bash
git add frontend/graph.js docs/CTO-FIX-VISJS-CONFIG.md

git commit -m "fix(visjs): Remove invalid animation option from Network config

- Remove top-level 'animation' option (not valid in Vis.js Network)
- Animation is only valid as method parameter (moveTo/fit/focus)
- Fix console errors: 'Unknown option detected: animation'
- Improve error handling with detailed logging

Resolves: Vis.js initialization failures and console errors"
```

#### 커밋 2: UX Improvement - Edge Label Formatting

```bash
git add frontend/graph.js docs/UX-CTO-EDGE-LABEL-FIX.md

git commit -m "fix(ux): Improve edge label formatting and readability

- Add formatEdgeLabel() function with safe number parsing
- Handle various backend data formats (string, number, null)
- Fix overlapping labels (e.g., '3.2% (22.0% (2건))')
- Improve ambiguous labels (e.g., '0.0% (2건)')
- Add zoom-level based edge label display (min 1.5x)
- Add importance-based filtering (min 1% ratio)

Improves: Edge label readability and data interpretation"
```

#### 커밋 3: UX Improvement - Node Visibility

```bash
git add frontend/graph.js docs/UX-CTO-REVIEW-DENSE-GRAPH.md

git commit -m "feat(ux): Add zoom-level based node label display

- Add LOD (Level of Detail) for node labels
- Show labels only when zoom >= 1.2x
- Prioritize important nodes (degree >= 10)
- Always show labels for selected/connected nodes
- Improve hover label highlighting (16px, enhanced background)

Improves: Graph readability in dense node environments"
```

#### 커밋 4: Performance - Initial View Filtering

```bash
git add frontend/graph.js docs/CTO-CRITICAL-FIX-DENSE-GRAPH.md

git commit -m "perf(graph): Add initial view filtering for large graphs

- Limit initial display to important nodes (max 1000)
- Filter by min connections (3), min ratio (5%), node types
- Sort by importance (degree + ratio) for top nodes
- Strengthen layout parameters (minDist 800px, repulsion 600)
- Increase initial placement radius (node count * 20)

Improves: Initial load performance and readability for 4,919 nodes"
```

#### 커밋 5: Feature - Dynamic Node Sizing

```bash
git add frontend/graph.js docs/CTO-NODE-SIZE-REVIEW.md

git commit -m "feat(graph): Add data-driven dynamic node sizing

- Calculate node size based on degree and ratio
- Size factors: degree (0.85x - 1.3x), ratio (1.0x - 1.15x)
- Cache average/max degree for performance
- Size range: 16px - 80px for readability
- Highlight selected nodes (+20%), dim unconnected (-30%)

Improves: Visual hierarchy and data insight discovery"
```

#### 커밋 6: UX Improvement - Node Colors

```bash
git add frontend/graph.js

git commit -m "feat(ux): Improve node color consistency with legend

- Add getNodeFillColor() for consistent fill colors
- Match node colors with legend colors
- Add hexToRgb() utility function
- Apply fill colors based on node type
- Enhance hover state with darker fill

Improves: Node type identification and visual consistency"
```

#### 커밋 7: Performance - Zoom Event Optimization

```bash
git add frontend/graph.js

git commit -m "perf(graph): Add debouncing for zoom events

- Debounce zoom event handler (150ms)
- Prevent excessive re-rendering during zoom
- Improve interaction smoothness

Improves: Performance during zoom interactions"
```

#### 커밋 8: Documentation

```bash
git add docs/

git commit -m "docs: Add comprehensive UX/CTO review documentation

- QA review reports
- CTO technical analysis
- UX improvement specifications
- Test results and checklists
- Git commit guide

Documents: All recent improvements and fixes"
```

---

## 6단계: 커밋 확인

```bash
# 최근 커밋 확인
git log --oneline -5

# 커밋 상세 확인
git show HEAD

# 변경사항 요약
git diff HEAD~1 HEAD --stat
```

---

## 7단계: 원격 저장소에 푸시 (선택적)

```bash
# 원격 저장소 확인
git remote -v

# 브랜치 확인
git branch

# 푸시 (main/master 브랜치인 경우)
git push origin main
# 또는
git push origin master

# 새 브랜치 생성 후 푸시 (권장)
git checkout -b feature/ux-improvements-2026-02-17
git push origin feature/ux-improvements-2026-02-17
```

---

## 권장 커밋 순서

### 순서 1: Critical Fixes 먼저 (가장 중요)

1. **Vis.js 설정 오류 수정** (Critical)
2. **엣지 라벨 포맷팅 개선** (Critical)

### 순서 2: UX Improvements

3. **노드 라벨 가시성 개선**
4. **노드 색상 일관성 개선**
5. **동적 노드 크기 계산**

### 순서 3: Performance & Optimization

6. **초기 뷰 필터링**
7. **줌 이벤트 최적화**

### 순서 4: Documentation

8. **문서 추가**

---

## 한 번에 커밋하는 방법 (간단 버전)

모든 변경사항을 논리적으로 그룹화하여 커밋:

```bash
# 1. Critical Fixes
git add frontend/graph.js docs/CTO-FIX-VISJS-CONFIG.md docs/UX-CTO-EDGE-LABEL-FIX.md
git commit -m "fix: Critical fixes for Vis.js config and edge labels

- Remove invalid animation option
- Fix edge label formatting and overlapping
- Add safe number parsing for various data formats"

# 2. UX Improvements
git add frontend/graph.js docs/UX-CTO-REVIEW-DENSE-GRAPH.md docs/CTO-NODE-SIZE-REVIEW.md
git commit -m "feat(ux): Comprehensive UX improvements

- Zoom-level based label display (LOD)
- Dynamic node sizing based on data
- Node color consistency with legend
- Hover label highlighting"

# 3. Performance Optimization
git add frontend/graph.js docs/CTO-CRITICAL-FIX-DENSE-GRAPH.md
git commit -m "perf: Optimize for large graph rendering

- Initial view filtering (max 1000 nodes)
- Strengthened layout parameters
- Zoom event debouncing"

# 4. Documentation
git add docs/
git commit -m "docs: Add comprehensive review documentation"
```

---

## 주의사항

1. **`.env` 파일은 커밋하지 마세요**
   ```bash
   # .env 파일이 변경되었다면 스테이징에서 제외
   git restore --staged .env
   ```

2. **대용량 파일 확인**
   ```bash
   # 커밋 전 파일 크기 확인
   git ls-files | xargs ls -lh | sort -k5 -hr | head -10
   ```

3. **민감한 정보 확인**
   ```bash
   # API 키나 비밀번호가 포함되지 않았는지 확인
   git diff | grep -i "api\|key\|password\|secret"
   ```

---

## 빠른 참조 명령어

```bash
# 상태 확인
git status

# 변경사항 확인
git diff

# 파일별 변경사항 확인
git diff frontend/graph.js

# 스테이징
git add <file>

# 커밋
git commit -m "메시지"

# 커밋 취소 (아직 푸시 안 했을 때)
git reset --soft HEAD~1

# 마지막 커밋 메시지 수정
git commit --amend -m "새 메시지"

# 커밋 로그 확인
git log --oneline --graph -10
```

---

**작성일**: 2026-02-17  
**다음 단계**: 위 순서대로 커밋 실행
