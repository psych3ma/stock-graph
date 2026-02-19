# CTO 검토: Vis.js / Neo4j / NetworkX 통합 아키텍처

**검토자**: CTO 전문가  
**검토 일자**: 2026-02-19  
**검토 범위**: Vis.js, Neo4j, NetworkX 간의 데이터 흐름, 호환성, 일관성, 유지보수성, 확장성

---

## 📋 Executive Summary

현재 구현은 **하이브리드 아키텍처**로 잘 설계되어 있으며, 각 컴포넌트의 역할이 명확히 분리되어 있습니다. 다만, **데이터 일관성 보장**과 **에러 복구 전략** 측면에서 개선이 필요합니다.

### 핵심 발견 사항

1. **✅ 강점**: 명확한 책임 분리 (Neo4j → NetworkX → Vis.js)
2. **🟡 개선 필요**: 레이아웃 실패 시 폴백 전략 명확화
3. **🟡 개선 필요**: 데이터 형식 일관성 검증
4. **🟢 권장**: 성능 모니터링 및 메트릭 수집

---

## 1. 아키텍처 개요

### 1.1 데이터 흐름

```
┌─────────────┐
│   Neo4j     │  그래프 데이터 저장소
│  (Graph DB) │  - 노드: Company, Stockholder, MajorShareholder
└──────┬──────┘  - 관계: HOLDS_SHARES, HAS_COMPENSATION
       │
       │ Cypher Query (REST API)
       ▼
┌─────────────┐
│   FastAPI   │  백엔드 API 서버
│  (Python)   │  - /api/v1/graph/nodes
└──────┬──────┘  - /api/v1/graph/edges
       │         - /api/v1/graph/layout
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│  NetworkX   │   │ PyGraphviz  │  레이아웃 계산 엔진
│  (Fallback) │   │ (Primary)   │  - Kamada-Kawai → Spring
└──────┬──────┘   └──────┬──────┘  - 0~1 정규화 좌표 반환
       │                 │
       └────────┬────────┘
                │ JSON Response
                │ { positions: { "n1": {x, y}, ... } }
                ▼
┌─────────────┐
│   Vis.js    │  프론트엔드 렌더링
│ (Client)    │  - physics: false (고정 좌표)
└─────────────┘  - 인터랙션 (드래그, 줌, 팬)
```

### 1.2 컴포넌트 역할 분리

| 컴포넌트 | 역할 | 책임 |
|---------|------|------|
| **Neo4j** | 데이터 저장소 | 그래프 데이터 영속성, 쿼리 최적화 |
| **FastAPI** | API 게이트웨이 | 데이터 변환, 비즈니스 로직 |
| **NetworkX/PyGraphviz** | 레이아웃 엔진 | 노드 위치 계산 (수학적 최적화) |
| **Vis.js** | 렌더링 엔진 | 시각화 및 사용자 인터랙션 |

---

## 2. 데이터 형식 일관성

### 2.1 노드 형식

**Neo4j → FastAPI 변환** (`graph.py:_row_to_node`):

```python
# Neo4j 응답
{
    "id": 123,
    "labels": ["Company", "LegalEntity"],
    "props": {"companyName": "삼성전자", "bizno": "123-45-67890"}
}

# FastAPI 응답 (표준화)
{
    "id": "n123",
    "type": "company",
    "label": "삼성전자",
    "bizno": "123-45-67890",
    "active": true,
    "sub": "회사"
}
```

**일관성 보장**:
- ✅ ID 형식 통일: `"n{neo4j_id}"` (문자열)
- ✅ 타입 매핑: Neo4j 레이블 → 프론트엔드 타입 (`company`, `person`, `major`, `institution`)
- ⚠️ 속성명 불일치: `stockName` vs `companyName` (Stockholder 노드)

**개선 제안**:
```python
# 명시적 속성 선택 로직
def _get_node_label(props: dict, labels: list) -> str:
    """노드 레이블 결정 (일관성 보장)"""
    if "Company" in labels and "Stockholder" not in labels:
        return props.get("companyName", "Unknown")
    elif "Stockholder" in labels:
        return props.get("stockName") or props.get("companyName", "Unknown")
    return "Unknown"
```

### 2.2 엣지 형식

**Neo4j → FastAPI 변환** (`graph.py:get_edges`):

```python
# Neo4j 응답 (집계)
{
    "fromId": 123,
    "toId": 456,
    "ratio": 25.5,
    "relCount": 3  # 동일 관계의 여러 버전 (reportYear별)
}

# FastAPI 응답 (표준화)
{
    "from": "n123",
    "to": "n456",
    "type": "HOLDS_SHARES",
    "ratio": 25.5,
    "count": 3,
    "label": "25.5%"
}
```

**일관성 보장**:
- ✅ ID 형식 통일: `"n{neo4j_id}"`
- ✅ 지분율 클램핑: `_clamp_ratio()` (0~100% 범위)
- ✅ 다중 관계 집계: `max(ratio)` 사용

### 2.3 레이아웃 좌표 형식

**NetworkX/PyGraphviz → FastAPI → Vis.js**:

```python
# NetworkX 레이아웃 (원시 좌표)
{
    "n123": (1234.5, 567.8),
    "n456": (-234.1, 890.2)
}

# FastAPI 정규화 (0~1 범위)
{
    "n123": {"x": 0.65, "y": 0.32},
    "n456": {"x": 0.12, "y": 0.78}
}

# Vis.js 스케일링 (픽셀 좌표)
{
    "n123": {x: 650, y: 320},  # viewport 크기에 따라 동적 계산
    "n456": {x: 120, y: 780}
}
```

**일관성 보장**:
- ✅ 정규화 범위: `[padding, 1-padding]` (기본 `padding=0.05`)
- ✅ 결정론적 레이아웃: `seed=42` 고정
- ⚠️ 뷰포트 크기 변경 시 재계산 필요

---

## 3. 호환성 검토

### 3.1 Neo4j 버전 호환성

**현재 요구사항**:
- Neo4j 4.x+ (기본 Cypher 쿼리)
- Neo4j 5.x+ (텍스트 인덱스, 범위 제약 조건)

**호환성 전략**:
```python
# 텍스트 인덱스 사용 시도 → 폴백
try:
    # Neo4j 5.x+ 텍스트 인덱스
    CALL db.index.fulltext.queryNodes('company_name_text', $search)
except ClientError:
    # Neo4j 4.x 폴백
    WHERE c.companyName CONTAINS $search
```

**개선 제안**:
```python
# 버전 감지 및 기능 플래그
def get_neo4j_version(graph) -> str:
    """Neo4j 버전 확인"""
    result = graph.query("CALL dbms.components() YIELD name, versions")
    # 버전에 따라 기능 활성화/비활성화
```

### 3.2 NetworkX / PyGraphviz 호환성

**현재 전략**:
- PyGraphviz 우선 시도 (고품질 레이아웃)
- 실패 시 NetworkX 폴백 (항상 사용 가능)

**호환성 보장**:
```python
# layout_service.py
try:
    import pygraphviz as pgv
    HAS_PYGRAPHVIZ = True
except ImportError:
    HAS_PYGRAPHVIZ = False

# 엔진 선택
if engine == "pygraphviz" and HAS_PYGRAPHVIZ:
    try:
        return _layout_with_pygraphviz(G)
    except Exception:
        engine = "networkx"  # 자동 폴백
```

**문제점**:
- PyGraphviz 실패 시 사용자에게 알림 없음
- 레이아웃 품질 차이를 사용자가 인지하기 어려움

**개선 제안**:
```python
# 레이아웃 품질 메타데이터 반환
{
    "positions": {...},
    "components": [...],
    "metadata": {
        "engine": "networkx",  # 실제 사용된 엔진
        "quality": "standard",  # "high" (pygraphviz) | "standard" (networkx)
        "fallback": true  # 폴백 사용 여부
    }
}
```

### 3.3 Vis.js 버전 호환성

**현재 사용 버전**:
- Vis.js Network (그래프 시각화)

**호환성 이슈**:
- `physics: false` 설정으로 고정 좌표 사용
- Vis.js 4.x+ API 변경사항 대응 필요

**검증 필요**:
```javascript
// Vis.js 버전 확인
if (typeof vis !== 'undefined' && vis.Network) {
    console.log('Vis.js version:', vis.Network.version || 'unknown');
}
```

---

## 4. 에러 처리 및 폴백 전략

### 4.1 현재 폴백 체인

```
1. PyGraphviz 레이아웃 시도
   ↓ 실패
2. NetworkX 레이아웃 시도
   ↓ 실패
3. 클라이언트 Force 시뮬레이션 (initPositions)
   ↓ 실패
4. 기본 원형 레이아웃
```

**문제점**:
- 각 단계의 실패 원인이 로깅되지 않음
- 사용자에게 폴백 상태를 알리지 않음

**개선 제안**:
```javascript
// frontend/graph.js
async function fetchServerLayout(...) {
    try {
        const result = await apiCall('/api/v1/graph/layout', ...);
        if (result.metadata?.fallback) {
            console.warn('Using fallback layout engine:', result.metadata.engine);
            updateStatus('표준 레이아웃 모드', false);
        }
        return result.positions;
    } catch (e) {
        logger.warn('Server layout failed, using client layout:', e);
        updateStatus('로컬 계산 모드로 전환되었습니다', false);
        return null;  // 클라이언트 폴백
    }
}
```

### 4.2 Neo4j 연결 실패 처리

**현재 구현** (`graph_service.py:get_graph`):
```python
def get_graph():
    try:
        graph = _get_graph()
        graph.query("RETURN 1 AS test LIMIT 1")  # 연결 확인
        return graph
    except Exception:
        global _graph
        _graph = None  # 재연결 시도
        return _get_graph()
```

**문제점**:
- 재연결 시도가 무한 루프 가능성
- 연결 실패 시 사용자에게 명확한 에러 메시지 없음

**개선 제안**:
```python
def get_graph(max_retries=3):
    """Neo4j 연결 (재시도 로직 포함)"""
    for attempt in range(max_retries):
        try:
            graph = _get_graph()
            graph.query("RETURN 1 AS test LIMIT 1")
            return graph
        except ServiceUnavailable:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # 지수 백오프
                global _graph
                _graph = None
                continue
            raise HTTPException(503, "Neo4j 서비스 사용 불가")
```

---

## 5. 성능 최적화

### 5.1 쿼리 최적화

**현재 상태**:
- ✅ 인덱스 생성 모듈 추가 (`neo4j_indexes.py`)
- ✅ 텍스트 검색 인덱스 활용 (Neo4j 5.x+)
- ⚠️ CONTAINS 폴백 (인덱스 없을 때)

**성능 메트릭**:
```python
# 쿼리 실행 시간 측정
import time

def measure_query_performance(query_func):
    start = time.time()
    result = query_func()
    elapsed = time.time() - start
    logger.info(f"Query executed in {elapsed:.3f}s")
    return result
```

### 5.2 레이아웃 캐싱

**현재 상태**:
- 레이아웃 캐싱 없음 (매번 재계산)

**개선 제안**:
```python
# 레이아웃 결과 캐싱 (노드/엣지 해시 기반)
from functools import lru_cache
import hashlib

def get_layout_cache_key(nodes, edges):
    """노드/엣지 해시 생성"""
    data = json.dumps({"nodes": nodes, "edges": edges}, sort_keys=True)
    return hashlib.md5(data.encode()).hexdigest()

@lru_cache(maxsize=100)
def get_cached_layout(cache_key):
    """캐시된 레이아웃 조회"""
    # Redis 또는 메모리 캐시 사용
    pass
```

### 5.3 프론트엔드 최적화

**현재 상태**:
- ✅ 디바운싱 (줌 이벤트)
- ✅ 조건부 렌더링 (라벨 표시)
- ⚠️ 대량 노드 처리 시 성능 저하 가능

**개선 제안**:
```javascript
// 가상화 (Virtual Scrolling) - 대량 노드 처리
const MAX_VISIBLE_NODES = 500;
const visibleNodes = nodes.filter((node, idx) => {
    const pos = positions[node.id];
    return isInViewport(pos) && idx < MAX_VISIBLE_NODES;
});
```

---

## 6. 확장성 고려사항

### 6.1 수평 확장

**현재 아키텍처**:
- 단일 FastAPI 인스턴스
- 단일 Neo4j 인스턴스

**확장 전략**:
```
┌─────────────┐
│  Load       │
│  Balancer   │
└──────┬──────┘
       │
   ┌───┴───┐
   │       │
┌──▼──┐ ┌──▼──┐
│ API │ │ API │  FastAPI 인스턴스 (여러 개)
└──┬──┘ └──┬──┘
   │       │
   └───┬───┘
       │
┌──────▼──────┐
│   Neo4j     │  클러스터 모드
│  Cluster    │  (Primary + Replicas)
└─────────────┘
```

**필요한 변경사항**:
- 세션 스티키니스 (레이아웃 캐시 공유)
- Neo4j 읽기 전용 복제본 활용

### 6.2 데이터 확장

**현재 제한사항**:
- `LIMIT` 기본값: 50 노드, 100 엣지
- 페이지네이션 부재

**확장 전략**:
```python
# 커서 기반 페이지네이션
@router.get("/nodes")
def get_nodes(
    limit: int = Query(50, ...),
    cursor: Optional[str] = Query(None),  # 마지막 노드 ID
    ...
):
    query = """
        MATCH (c:Company)
        WHERE ($cursor IS NULL OR id(c) > $cursor)
        RETURN id(c) AS id, ...
        ORDER BY id(c)
        LIMIT $limit
    """
```

---

## 7. 유지보수성 개선

### 7.1 코드 일관성

**현재 상태**:
- ✅ 명확한 함수 분리
- ✅ 타입 힌트 사용 (Python)
- ⚠️ JavaScript 타입 검증 부재

**개선 제안**:
```javascript
// JSDoc 타입 힌트
/**
 * @param {Array<{id: string, type: string, label: string}>} nodes
 * @param {Array<{from: string, to: string, ratio: number}>} edges
 * @returns {Promise<Object<string, {x: number, y: number}>>}
 */
async function fetchServerLayout(nodes, edges, viewportW, viewportH) {
    // ...
}
```

### 7.2 로깅 및 모니터링

**현재 상태**:
- 기본적인 Python 로깅
- 프론트엔드 콘솔 로그

**개선 제안**:
```python
# 구조화된 로깅
import structlog

logger = structlog.get_logger()
logger.info(
    "layout_computed",
    engine="networkx",
    node_count=len(nodes),
    edge_count=len(edges),
    duration_ms=elapsed * 1000,
)
```

```javascript
// 프론트엔드 메트릭 수집
function trackLayoutPerformance(engine, nodeCount, duration) {
    if (window.analytics) {
        window.analytics.track('layout_computed', {
            engine,
            node_count: nodeCount,
            duration_ms: duration,
        });
    }
}
```

---

## 8. 우선순위별 액션 아이템

### P0 - Critical (즉시 조치)

1. **인덱스 자동 생성**
   - ✅ `neo4j_indexes.py` 모듈 생성 완료
   - ✅ 앱 기동 시 자동 실행 추가 완료
   - ⏳ 인덱스 생성 확인 엔드포인트 추가

2. **에러 핸들링 개선**
   - ✅ Neo4j 예외 타입별 처리 추가 완료
   - ⏳ 재연결 로직 개선 (지수 백오프)

### P1 - High (단기)

3. **레이아웃 메타데이터 반환**
   - 엔진 정보, 폴백 여부 포함

4. **데이터 형식 검증**
   - API 응답 스키마 검증 (Pydantic)

### P2 - Medium (중기)

5. **성능 모니터링**
   - 쿼리 실행 시간 측정
   - 레이아웃 계산 시간 측정

6. **캐싱 전략**
   - 레이아웃 결과 캐싱
   - 노드 개수 캐싱

### P3 - Low (장기)

7. **페이지네이션**
   - 커서 기반 페이지네이션

8. **가상화**
   - 대량 노드 처리 최적화

---

## 9. 결론

현재 **Vis.js / Neo4j / NetworkX 통합 아키텍처**는 **명확한 책임 분리**와 **폴백 전략**을 갖추고 있어 **확장 가능하고 유지보수 가능**합니다.

**핵심 강점**:
- ✅ 컴포넌트 간 느슨한 결합
- ✅ 명확한 데이터 형식 계약
- ✅ 다단계 폴백 전략

**개선 필요 영역**:
- 🔧 에러 처리 및 사용자 피드백 강화
- 🔧 성능 모니터링 및 메트릭 수집
- 🔧 데이터 일관성 검증 강화

이러한 개선을 통해 **프로덕션 수준의 안정성과 성능**을 확보할 수 있습니다.

---

**참고 문서**:
- [`docs/CTO-NEO4J-GRAPH-DB-REVIEW.md`](./CTO-NEO4J-GRAPH-DB-REVIEW.md) - Neo4j 최적화 상세
- [`docs/PYGRAPHVIZ-VISJS-HYBRID.md`](./PYGRAPHVIZ-VISJS-HYBRID.md) - 하이브리드 아키텍처 설계
