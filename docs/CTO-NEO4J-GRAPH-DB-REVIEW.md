# CTO 검토: Neo4j 그래프 DB 아키텍처

**검토자**: 그래프 DB 전문가 출신 CTO  
**검토 일자**: 2026-02-19  
**검토 범위**: Neo4j 데이터 모델, Cypher 쿼리 최적화, API 설계, 성능/확장성/유지보수성

---

## 📋 Executive Summary

현재 구현은 **기본적인 기능은 충실히 구현**되어 있으나, **프로덕션 수준의 성능 최적화와 데이터 일관성 보장** 측면에서 개선이 필요합니다.

### 핵심 발견 사항

1. **🔴 Critical (P0)**: 인덱스 부재로 인한 성능 저하 위험
2. **🟡 High (P1)**: 쿼리 최적화 이슈 (f-string 쿼리 생성, CONTAINS 사용)
3. **🟡 High (P1)**: 데이터 모델 일관성 검증 부재
4. **🟢 Medium (P2)**: 연결 풀 및 타임아웃 설정 부재
5. **🟢 Medium (P2)**: 트랜잭션 관리 전략 부재

---

## 1. 데이터 모델 분석

### 1.1 노드 레이블 구조

**현재 모델**:
```
- (c:Company:LegalEntity)      # 회사
- (p:Person:Stockholder)        # 개인 주주
- (x:Company:Stockholder)       # 법인 주주
- (:MajorShareholder)           # 최대주주 (5% 이상)
```

**문제점**:
- `Company:Stockholder` 레이블 조합이 모호함 (회사이면서 주주인 경우)
- `MajorShareholder`가 독립 레이블로만 존재 (다른 레이블과의 관계 불명확)
- 레이블 계층 구조가 명시적이지 않음

**권장사항**:
```cypher
// 명시적 레이블 계층
(:Company)                    // 기본 회사
(:Company:Stockholder)        // 법인 주주 (회사이면서 주주)
(:Person:Stockholder)         // 개인 주주
(:Stockholder:MajorShareholder)  // 최대주주 (주주이면서 5% 이상)
```

### 1.2 관계 타입

**현재 모델**:
```
(s:Stockholder)-[:HOLDS_SHARES]->(c:Company)
(c:Company)-[:HAS_COMPENSATION]->(c:Company)
```

**문제점**:
- `HAS_COMPENSATION` 관계가 `Company->Company`로 모델링되어 있으나, 실제 의미는 "회사가 보상 정보를 가짐"일 가능성
- 관계 방향성의 의미가 불명확

**권장사항**:
```cypher
// 관계 방향성 명확화
(:Company)-[:HAS_COMPENSATION]->(:Compensation)  // 별도 노드로 분리 고려
// 또는
(:Company)-[:REPORTS_COMPENSATION {fiscalYear, ...}]->(:Company)  // 자기 참조 명확화
```

### 1.3 속성 일관성

**현재 속성**:
- `Company`: `bizno`, `companyName`, `isActive`, `closedDate`
- `Stockholder`: `stockName`, `companyName`, `shareholderType`
- `HOLDS_SHARES`: `stockRatio`, `stockCount`, `stockType`, `baseDate`, `reportYear`

**문제점**:
- `Stockholder` 노드에 `companyName`과 `stockName`이 공존 (어떤 것을 사용할지 불명확)
- `shareholderType` 값이 `'PERSON'`, `'CORPORATION'`, `'INSTITUTION'`로 혼재 (대소문자 일관성)
- `stockRatio`가 Float이지만 범위 검증 부재 (0~100% 범위)

**권장사항**:
```cypher
// 속성명 통일
(:Person:Stockholder) { stockName, ... }           // stockName만 사용
(:Company:Stockholder) { companyName, ... }        // companyName만 사용

// 제약 조건 추가
CREATE CONSTRAINT stockRatio_range IF NOT EXISTS
FOR ()-[r:HOLDS_SHARES]-()
REQUIRE r.stockRatio >= 0.0 AND r.stockRatio <= 100.0;
```

---

## 2. 인덱스 및 제약 조건

### 2.1 현재 인덱스 상태

**존재하는 인덱스**:
- ✅ `company_name_vector` (벡터 인덱스, `nameEmbedding` 속성)

**부재한 인덱스**:
- ❌ `companyName` 텍스트 검색 인덱스
- ❌ `stockName` 텍스트 검색 인덱스
- ❌ `bizno` 고유 제약 조건
- ❌ `personId` 고유 제약 조건 (있는 경우)

### 2.2 성능 영향 분석

**문제가 되는 쿼리 패턴**:

```cypher
// graph.py:127 - CONTAINS 검색 (인덱스 없음)
MATCH (c:Company)
WHERE c.companyName CONTAINS $search
RETURN ...
```

**영향**:
- `CONTAINS`는 전체 스캔을 유발 (O(n) 복잡도)
- 노드 수가 증가하면 선형적으로 성능 저하
- 현재는 작은 데이터셋이지만, 확장 시 심각한 병목

**권장 인덱스**:

```cypher
// 1. 텍스트 검색 인덱스 (Neo4j 5.x+)
CREATE TEXT INDEX company_name_text IF NOT EXISTS
FOR (c:Company) ON (c.companyName);

CREATE TEXT INDEX stockholder_name_text IF NOT EXISTS
FOR (s:Stockholder) ON (s.stockName);

// 2. 범위 검색 인덱스 (지분율 필터링)
CREATE INDEX holds_shares_ratio IF NOT EXISTS
FOR ()-[r:HOLDS_SHARES]-() ON (r.stockRatio);

// 3. 고유 제약 조건 (데이터 무결성)
CREATE CONSTRAINT bizno_unique IF NOT EXISTS
FOR (c:Company) REQUIRE c.bizno IS UNIQUE;

// 4. 복합 인덱스 (자주 함께 조회되는 속성)
CREATE INDEX company_active IF NOT EXISTS
FOR (c:Company) ON (c.isActive, c.companyName);
```

---

## 3. Cypher 쿼리 최적화

### 3.1 쿼리 생성 방식

**문제점 1: f-string 쿼리 생성 (SQL Injection 위험)**

```python
# graph.py:489 - f-string 사용
nodes_query = f"""
    MATCH (ego)
    WHERE id(ego) = $id
    OPTIONAL MATCH (ego)-[r1:HOLDS_SHARES{rel_pattern}]->(n1)
    ...
"""
```

**문제**:
- `rel_pattern`이 사용자 입력에 의존할 경우 보안 취약점
- 현재는 `max_hops` 파라미터로 제한되어 있으나, 확장 시 위험

**권장사항**:
```python
# 파라미터화된 쿼리 사용
rel_patterns = {1: "*1..1", 2: "*1..2", 3: "*1..3"}
rel_pattern = rel_patterns.get(max_hops, "*1..2")

nodes_query = """
    MATCH (ego)
    WHERE id(ego) = $id
    OPTIONAL MATCH (ego)-[r1:HOLDS_SHARES*1..$max_hops]->(n1)
    ...
"""
params = {"id": neo4j_id, "max_hops": max_hops}
```

**문제점 2: 비효율적인 CONTAINS 검색**

```cypher
# graph.py:127, 151
WHERE c.companyName CONTAINS $search
WHERE coalesce(s.stockName, s.companyName, '') CONTAINS $search
```

**문제**:
- `CONTAINS`는 인덱스를 사용하지 못함
- `coalesce()` 사용으로 인해 쿼리 플래너가 최적화하기 어려움

**권장사항**:
```cypher
// 텍스트 인덱스 사용 (Neo4j 5.x+)
WHERE c.companyName =~ $search_pattern  // 정규식 (인덱스 활용 가능)
// 또는
CALL db.index.fulltext.queryNodes('company_name_text', $search)
YIELD node, score
WHERE score > 0.5
```

**문제점 3: 불필요한 DISTINCT 사용**

```cypher
# graph.py:497
WITH DISTINCT n
```

**문제**:
- `OPTIONAL MATCH`와 `UNWIND` 조합에서 이미 중복 제거 가능
- `DISTINCT`는 메모리 사용 증가

**권장사항**:
```cypher
// 집계 함수로 중복 제거
WITH collect(DISTINCT n) AS nodes
UNWIND nodes AS n
```

### 3.2 쿼리 성능 최적화

**문제점: 다중 쿼리 실행**

```python
# graph.py:356, 376, 398, 412 - 노드 상세 조회 시 4개 쿼리 실행
node_rows = graph.query(node_query, ...)
related_rows = graph.query(related_query, ...)
stat_rows = graph.query(max_ratio_query, ...)
```

**권장사항**:
```cypher
// 단일 쿼리로 통합
MATCH (n)
WHERE id(n) = $id
OPTIONAL MATCH (n)-[r:HOLDS_SHARES]-(m)
WITH n, collect(DISTINCT {
    id: id(m),
    labels: labels(m),
    props: properties(m),
    ratio: r.stockRatio
}) AS related
OPTIONAL MATCH (n:Company)<-[r2:HOLDS_SHARES]-(s)
WITH n, related, 
     max(r2.stockRatio) AS maxRatio,
     count(DISTINCT s) AS holderCount
RETURN ...
```

---

## 4. 연결 관리 및 성능

### 4.1 연결 풀 설정

**현재 상태**:
- `Neo4jGraph` (LangChain) 사용으로 연결 풀 설정이 숨겨짐
- 명시적인 연결 풀 크기, 타임아웃 설정 부재

**권장사항**:
```python
# backend/app/core/neo4j_config.py (신규 생성)
from neo4j import GraphDatabase
from langchain_neo4j import Neo4jGraph

def get_neo4j_driver():
    """명시적 Neo4j 드라이버 생성 (연결 풀 제어)"""
    s = get_settings()
    return GraphDatabase.driver(
        s.NEO4J_URI,
        auth=(s.NEO4J_USER, s.NEO4J_PASSWORD),
        max_connection_lifetime=3600,  # 1시간
        max_connection_pool_size=50,
        connection_acquisition_timeout=30,
    )

# Neo4jGraph 대신 직접 드라이버 사용 고려
```

### 4.2 쿼리 타임아웃

**현재 상태**:
- 쿼리별 타임아웃 설정 부재
- 장시간 실행 쿼리 시 전체 연결 블로킹 가능

**권장사항**:
```python
# 쿼리 실행 시 타임아웃 설정
def execute_query_with_timeout(graph, query, params, timeout=30):
    """타임아웃이 있는 쿼리 실행"""
    try:
        result = graph.query(
            query,
            params=params,
            timeout=timeout  # Neo4j 드라이버 타임아웃
        )
        return result
    except TimeoutError:
        logger.error(f"Query timeout: {query[:100]}")
        raise HTTPException(504, "쿼리 실행 시간 초과")
```

---

## 5. 데이터 일관성 및 무결성

### 5.1 제약 조건 부재

**현재 상태**:
- 고유성 제약 조건 없음 (`bizno`, `personId` 등)
- 범위 제약 조건 없음 (`stockRatio` 0~100% 검증)

**권장사항**:
```cypher
// 1. 고유성 제약 조건
CREATE CONSTRAINT bizno_unique IF NOT EXISTS
FOR (c:Company) REQUIRE c.bizno IS UNIQUE;

CREATE CONSTRAINT person_id_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.personId IS UNIQUE;

// 2. 존재 제약 조건 (필수 속성)
CREATE CONSTRAINT company_name_exists IF NOT EXISTS
FOR (c:Company) REQUIRE c.companyName IS NOT NULL;

// 3. 범위 제약 조건 (Neo4j 5.x+)
CREATE CONSTRAINT stock_ratio_range IF NOT EXISTS
FOR ()-[r:HOLDS_SHARES]-()
REQUIRE r.stockRatio >= 0.0 AND r.stockRatio <= 100.0;
```

### 5.2 데이터 검증 로직

**현재 상태**:
- Python 레벨에서만 검증 (`_clamp_ratio()`)
- DB 레벨 검증 부재

**권장사항**:
```python
# 백엔드 검증 + DB 제약 조건 이중 방어
def validate_stock_ratio(ratio: float) -> float:
    """지분율 검증 및 정규화"""
    if ratio < 0 or ratio > 100:
        logger.warning(f"Invalid stockRatio: {ratio}, clamping to 0-100")
    return max(0.0, min(100.0, ratio))
```

---

## 6. 확장성 고려사항

### 6.1 대용량 데이터 처리

**현재 제한사항**:
- `LIMIT` 기본값이 작음 (50 노드, 100 엣지)
- 페이지네이션 부재

**권장사항**:
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
          AND ($search IS NULL OR c.companyName CONTAINS $search)
        RETURN id(c) AS id, ...
        ORDER BY id(c)
        LIMIT $limit
    """
```

### 6.2 쿼리 결과 캐싱

**현재 상태**:
- 캐싱 전략 부재
- 동일 쿼리 반복 실행

**권장사항**:
```python
# Redis 캐싱 (선택적)
from functools import lru_cache
from datetime import timedelta

@lru_cache(maxsize=1000)
def get_node_counts_cached():
    """노드 개수 조회 캐싱 (5분 TTL)"""
    return get_node_counts()

# 또는 Redis 사용
import redis
cache = redis.Redis(...)

def get_node_counts():
    cache_key = "node_counts"
    cached = cache.get(cache_key)
    if cached:
        return json.loads(cached)
    result = _fetch_node_counts()
    cache.setex(cache_key, 300, json.dumps(result))  # 5분 TTL
    return result
```

---

## 7. 보안 및 안정성

### 7.1 쿼리 인젝션 방지

**현재 상태**:
- 대부분 파라미터화된 쿼리 사용 ✅
- f-string 쿼리 생성 이슈 (graph.py:489) ⚠️

**권장사항**:
- 모든 쿼리를 파라미터화
- f-string 사용 금지 (정적 패턴만 허용)

### 7.2 에러 핸들링

**현재 상태**:
- 기본적인 try-except 사용 ✅
- 구체적인 Neo4j 에러 타입 처리 부재

**권장사항**:
```python
from neo4j.exceptions import (
    ServiceUnavailable,
    TransientError,
    ClientError,
)

try:
    result = graph.query(...)
except ServiceUnavailable:
    raise HTTPException(503, "Neo4j 서비스 사용 불가")
except TransientError:
    raise HTTPException(503, "일시적 오류, 재시도 필요")
except ClientError as e:
    if "Constraint" in str(e):
        raise HTTPException(400, "데이터 제약 조건 위반")
    raise HTTPException(400, f"쿼리 오류: {str(e)}")
```

---

## 8. 우선순위별 액션 아이템

### P0 - Critical (즉시 조치)

1. **인덱스 생성**
   - `companyName` 텍스트 인덱스
   - `stockName` 텍스트 인덱스
   - `stockRatio` 범위 인덱스
   - `bizno` 고유 제약 조건

2. **f-string 쿼리 제거**
   - `graph.py:489` 쿼리를 파라미터화

### P1 - High (단기)

3. **쿼리 최적화**
   - `CONTAINS` → 텍스트 인덱스 활용
   - 다중 쿼리 → 단일 쿼리 통합
   - 불필요한 `DISTINCT` 제거

4. **데이터 모델 일관성**
   - 레이블 계층 구조 명확화
   - 속성명 통일 (`stockName` vs `companyName`)

### P2 - Medium (중기)

5. **연결 풀 및 타임아웃 설정**
   - 명시적 드라이버 설정
   - 쿼리별 타임아웃

6. **제약 조건 추가**
   - 범위 제약 조건 (`stockRatio`)
   - 존재 제약 조건 (필수 속성)

### P3 - Low (장기)

7. **캐싱 전략**
   - 노드 개수 캐싱
   - 자주 조회되는 쿼리 결과 캐싱

8. **페이지네이션**
   - 커서 기반 페이지네이션 구현

---

## 9. 코드 예시: 개선된 구현

### 9.1 인덱스 초기화 스크립트

```python
# backend/app/core/neo4j_indexes.py
def ensure_indexes():
    """모든 필수 인덱스 및 제약 조건 생성"""
    graph = graph_service.get_graph()
    
    indexes = [
        # 텍스트 인덱스
        "CREATE TEXT INDEX company_name_text IF NOT EXISTS FOR (c:Company) ON (c.companyName)",
        "CREATE TEXT INDEX stockholder_name_text IF NOT EXISTS FOR (s:Stockholder) ON (s.stockName)",
        
        # 범위 인덱스
        "CREATE INDEX holds_shares_ratio IF NOT EXISTS FOR ()-[r:HOLDS_SHARES]-() ON (r.stockRatio)",
        
        # 고유 제약 조건
        "CREATE CONSTRAINT bizno_unique IF NOT EXISTS FOR (c:Company) REQUIRE c.bizno IS UNIQUE",
        
        # 존재 제약 조건
        "CREATE CONSTRAINT company_name_exists IF NOT EXISTS FOR (c:Company) REQUIRE c.companyName IS NOT NULL",
    ]
    
    for idx_query in indexes:
        try:
            graph.query(idx_query)
            logger.info(f"Index created: {idx_query[:50]}...")
        except ClientError as e:
            logger.warning(f"Index creation skipped: {e}")
```

### 9.2 최적화된 노드 조회 쿼리

```python
# backend/app/api/v1/endpoints/graph.py
@router.get("/nodes")
def get_nodes(...):
    # 텍스트 인덱스 활용
    if sanitized_search:
        query = """
            CALL db.index.fulltext.queryNodes('company_name_text', $search)
            YIELD node, score
            WHERE score > 0.5 AND ($node_type IS NULL OR 'Company' IN labels(node))
            RETURN id(node) AS id, labels(node) AS labels, properties(node) AS props
            LIMIT $limit
        """
        params = {"search": sanitized_search, "node_type": nt, "limit": limit}
    else:
        # 인덱스 스캔 활용
        query = """
            MATCH (c:Company)
            WHERE ($node_type IS NULL OR 'Company' IN labels(c))
            USING INDEX c:Company(companyName)
            RETURN id(c) AS id, labels(c) AS labels, properties(c) AS props
            LIMIT $limit
        """
        params = {"node_type": nt, "limit": limit}
    
    rows = graph.query(query, params=params)
    # ...
```

---

## 10. 결론

현재 구현은 **기능적으로는 완성도가 높으나**, **프로덕션 수준의 성능과 안정성**을 위해서는 다음 개선이 필수입니다:

1. **인덱스 전략 수립 및 적용** (P0)
2. **쿼리 최적화** (P1)
3. **데이터 모델 일관성 강화** (P1)
4. **연결 관리 및 타임아웃 설정** (P2)

이러한 개선을 통해 **확장 가능하고 유지보수 가능한 그래프 DB 아키텍처**를 구축할 수 있습니다.

---

**참고 문서**:
- [Neo4j Performance Tuning](https://neo4j.com/docs/operations-manual/current/performance/)
- [Cypher Query Optimization](https://neo4j.com/docs/cypher-manual/current/query-tuning/)
- [Neo4j Indexes and Constraints](https://neo4j.com/docs/cypher-manual/current/constraints/)
