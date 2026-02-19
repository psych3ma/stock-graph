# Git 커밋 실행 순서

**목적**: 변경사항을 논리적으로 그룹화하여 커밋

---

## 📋 현재 상태

- **수정된 파일**: 12개
- **새 파일**: 30개 (주로 문서)
- **삭제된 파일**: 7개 (레거시 문서)

---

## 🚀 실행 순서

### Step 1: Critical Fixes (핵심 버그 수정)

```bash
# Vis.js 설정 오류 수정
git add frontend/graph.js docs/CTO-FIX-VISJS-CONFIG.md

git commit -m "fix(visjs): Remove invalid animation option from Network config

- Remove top-level 'animation' option causing console errors
- Animation only valid as method parameter (moveTo/fit/focus)
- Add detailed error logging for debugging
- Fix: 'Unknown option detected: animation' errors"
```

---

### Step 2: Edge Label Formatting Fix

```bash
# 엣지 라벨 포맷팅 개선
git add frontend/graph.js docs/UX-CTO-EDGE-LABEL-FIX.md

git commit -m "fix(ux): Fix edge label formatting and overlapping issues

- Add formatEdgeLabel() with safe number parsing
- Handle string/number/null data formats from backend
- Fix overlapping labels (e.g., '3.2% (22.0% (2건))')
- Improve ambiguous '0.0% (2건)' labels
- Add zoom-level based edge label display (min 1.5x)
- Filter low-importance edges (< 1% ratio)"
```

---

### Step 3: Node Visibility & Label Display

```bash
# 노드 라벨 가시성 개선
git add frontend/graph.js docs/UX-CTO-REVIEW-DENSE-GRAPH.md

git commit -m "feat(ux): Add zoom-level based node label display (LOD)

- Show labels only when zoom >= 1.2x
- Prioritize important nodes (degree >= 10)
- Always show labels for selected/connected nodes
- Enhance hover label highlighting (16px, enhanced background)
- Improve readability in dense graph environments"
```

---

### Step 4: Node Color Consistency

```bash
# 노드 색상 일관성 개선
git add frontend/graph.js

git commit -m "feat(ux): Improve node color consistency with legend

- Add getNodeFillColor() and hexToRgb() utilities
- Match node fill colors with legend colors
- Apply fill colors based on node type
- Enhance hover state with darker fill colors"
```

---

### Step 5: Dynamic Node Sizing

```bash
# 동적 노드 크기 계산
git add frontend/graph.js docs/CTO-NODE-SIZE-REVIEW.md

git commit -m "feat(graph): Add data-driven dynamic node sizing

- Calculate size based on degree (0.85x - 1.3x) and ratio (1.0x - 1.15x)
- Cache average/max degree for performance
- Size range: 16px - 80px for readability
- Highlight selected nodes (+20%), dim unconnected (-30%)
- Improve visual hierarchy and data insights"
```

---

### Step 6: Initial View Filtering & Performance

```bash
# 초기 뷰 필터링 및 성능 최적화
git add frontend/graph.js docs/CTO-CRITICAL-FIX-DENSE-GRAPH.md

git commit -m "perf(graph): Add initial view filtering for large graphs

- Limit initial display to important nodes (max 1000)
- Filter by min connections (3), min ratio (5%), node types
- Sort by importance (degree + ratio)
- Strengthen layout parameters (minDist 800px, repulsion 600)
- Increase initial placement radius (node count * 20)
- Add zoom event debouncing (150ms)

Improves: Performance and readability for 4,919 nodes"
```

---

### Step 7: Backend Improvements

```bash
# 백엔드 개선사항
git add backend/app/api/v1/endpoints/graph.py backend/app/services/graph_service.py backend/app/api/v1/endpoints/chat.py docs/NEO4J-EXPERT-FIXES.md

git commit -m "fix(backend): Improve edge aggregation and AI context handling

- Aggregate edges by (fromId, toId) with max ratio and count
- Fix edge label percentages over 100%
- Reduce Neo4j schema size (enhanced_schema=False)
- Add DELETE endpoint for chat history reset
- Fix context length exceeded errors"
```

---

### Step 8: Frontend HTML/CSS Updates

```bash
# 프론트엔드 UI 개선
git add frontend/graph.html frontend/graph.css

git commit -m "feat(ux): Improve UI components and styling

- Add logo home button functionality
- Add search results dropdown
- Add chat reset button
- Improve node detail panel (sticky actions, related nodes)
- Enhance search and filter UI styling"
```

---

### Step 9: Backend Infrastructure

```bash
# 백엔드 인프라 변경
git add backend/Dockerfile backend/requirements.txt backend/requirements-pygraphviz.txt backend/app/services/layout_service.py backend/app/schemas/layout.py

git commit -m "feat(backend): Add layout service and PyGraphviz support

- Add layout_service.py for server-side graph layout
- Add layout schema (LayoutRequest/Response)
- Update Dockerfile for Graphviz support
- Add requirements-pygraphviz.txt
- Support NetworkX and PyGraphviz engines"
```

---

### Step 10: Documentation Cleanup

```bash
# 레거시 문서 삭제
git add docs/CTO_ANALYSIS.md docs/CTO_COMPREHENSIVE_REVIEW.md docs/CTO_FIXES_COMPLETE.md docs/CTO_FIXES_SUMMARY.md docs/CTO_PRIORITY_FIXES.md docs/FIXES_APPLIED.md docs/FIXES_SUMMARY.md

git commit -m "chore(docs): Remove legacy documentation files

- Remove outdated CTO analysis documents
- Consolidate into new structured documentation"
```

---

### Step 11: New Documentation

```bash
# 새 문서 추가
git add docs/ACTION-ITEMS.md docs/CHANGELOG.md docs/CTO-CRITICAL-FIX-DENSE-GRAPH.md docs/CTO-FIX-VISJS-CONFIG.md docs/CTO-NODE-SIZE-REVIEW.md docs/D3-SVG-UX-ANALYSIS.md docs/NEO4J-EXPERT-FIXES.md docs/QA-CTO-REVIEW-DENSE-GRAPH.md docs/QA-REVIEW-CRITICAL-ISSUES.md docs/STOCKHOLDER-PROPERTIES-LIST.md docs/TEST-RESULTS-REPORT.md docs/UX-CTO-COMPREHENSIVE-FIX.md docs/UX-CTO-EDGE-LABEL-FIX.md docs/UX-REVIEW-PRODUCT-SPEC.md docs/GIT-COMMIT-GUIDE.md docs/GIT-COMMIT-STEPS.md

git commit -m "docs: Add comprehensive review and implementation documentation

- QA review reports
- CTO technical analysis
- UX improvement specifications
- Test results and checklists
- Git commit guide
- Action items and changelog"
```

---

### Step 12: Configuration Files

```bash
# 설정 파일 업데이트
git add .env.example README.md backend/app/services/__init__.py

git commit -m "chore: Update configuration and documentation

- Update .env.example with latest settings
- Update README.md with current features
- Update service imports"
```

---

## ✅ 최종 확인

```bash
# 모든 변경사항이 커밋되었는지 확인
git status

# 커밋 로그 확인
git log --oneline --graph -15

# 변경사항 요약
git diff HEAD~12 HEAD --stat
```

---

## 🚀 원격 저장소에 푸시 (선택적)

```bash
# 현재 브랜치 확인
git branch

# 원격 저장소 확인
git remote -v

# 푸시
git push origin main

# 또는 새 브랜치 생성 후 푸시 (권장)
git checkout -b feature/ux-performance-improvements-2026-02-17
git push origin feature/ux-performance-improvements-2026-02-17
```

---

## 📝 한 번에 실행하는 스크립트 (복사해서 사용)

```bash
#!/bin/bash
# Git 커밋 자동화 스크립트

cd /Users/coruscatio/Desktop/demo/stock-graph

# Step 1: Critical Fixes
git add frontend/graph.js docs/CTO-FIX-VISJS-CONFIG.md
git commit -m "fix(visjs): Remove invalid animation option from Network config"

# Step 2: Edge Label Formatting
git add frontend/graph.js docs/UX-CTO-EDGE-LABEL-FIX.md
git commit -m "fix(ux): Fix edge label formatting and overlapping issues"

# Step 3: Node Visibility
git add frontend/graph.js docs/UX-CTO-REVIEW-DENSE-GRAPH.md
git commit -m "feat(ux): Add zoom-level based node label display (LOD)"

# Step 4: Node Colors
git add frontend/graph.js
git commit -m "feat(ux): Improve node color consistency with legend"

# Step 5: Dynamic Node Sizing
git add frontend/graph.js docs/CTO-NODE-SIZE-REVIEW.md
git commit -m "feat(graph): Add data-driven dynamic node sizing"

# Step 6: Performance Optimization
git add frontend/graph.js docs/CTO-CRITICAL-FIX-DENSE-GRAPH.md
git commit -m "perf(graph): Add initial view filtering for large graphs"

# Step 7: Backend Improvements
git add backend/app/api/v1/endpoints/graph.py backend/app/services/graph_service.py backend/app/api/v1/endpoints/chat.py docs/NEO4J-EXPERT-FIXES.md
git commit -m "fix(backend): Improve edge aggregation and AI context handling"

# Step 8: Frontend UI
git add frontend/graph.html frontend/graph.css
git commit -m "feat(ux): Improve UI components and styling"

# Step 9: Backend Infrastructure
git add backend/Dockerfile backend/requirements.txt backend/requirements-pygraphviz.txt backend/app/services/layout_service.py backend/app/schemas/layout.py
git commit -m "feat(backend): Add layout service and PyGraphviz support"

# Step 10: Documentation Cleanup
git rm docs/CTO_ANALYSIS.md docs/CTO_COMPREHENSIVE_REVIEW.md docs/CTO_FIXES_COMPLETE.md docs/CTO_FIXES_SUMMARY.md docs/CTO_PRIORITY_FIXES.md docs/FIXES_APPLIED.md docs/FIXES_SUMMARY.md
git commit -m "chore(docs): Remove legacy documentation files"

# Step 11: New Documentation
git add docs/
git commit -m "docs: Add comprehensive review and implementation documentation"

# Step 12: Configuration
git add .env.example README.md backend/app/services/__init__.py
git commit -m "chore: Update configuration and documentation"

# 확인
echo "=== 커밋 완료 ==="
git log --oneline -12
```

---

## ⚠️ 주의사항

1. **`.env` 파일은 커밋하지 마세요**
   ```bash
   # .env 파일이 있다면 확인
   git status | grep .env
   # .env는 커밋하지 않음 (이미 .gitignore에 있을 것)
   ```

2. **각 커밋 전에 확인**
   ```bash
   # 스테이징된 파일 확인
   git status
   
   # 변경사항 확인
   git diff --cached
   ```

3. **커밋 메시지 수정이 필요하면**
   ```bash
   # 마지막 커밋 메시지 수정
   git commit --amend -m "새 메시지"
   ```

---

**작성일**: 2026-02-17  
**사용법**: 위 순서대로 하나씩 실행하거나, 스크립트를 복사하여 실행
