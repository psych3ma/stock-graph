# CTO Review: 주주 수 계산식 검토

**검토자**: 그래프 DB 전문가 출신 CTO  
**검토 일자**: 2026-02-19  
**문제**: 연결 노드 14인데 주주 수가 33으로 표시됨

---

## 🔍 문제 분석

### 현재 상황

**UI 표시**:
- 주주 수: **33**
- 연결 노드: **14**

**불일치**: 주주 수가 연결 노드보다 2배 이상 많음

---

## 📊 코드 분석

### 1. 주주 수 계산 쿼리

**위치**: `backend/app/api/v1/endpoints/graph.py` (라인 480-483)

```cypher
MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
RETURN max(r.stockRatio) AS maxRatio, count(r) AS holderCount
```

**문제점**:
- `count(r)`는 **관계(relationship)의 개수**를 세고 있음
- 같은 주주가 여러 개의 관계를 가질 수 있음
- 예: 같은 주주가 여러 번 주식을 보유한 경우, 데이터 중복 등

**결과**: 관계 개수 = 33

---

### 2. 연결 노드 계산 쿼리

**위치**: `backend/app/api/v1/endpoints/graph.py` (라인 433-439)

```cypher
MATCH (n)-[r:HOLDS_SHARES]-(m)
WHERE id(n) = $id
WITH m, labels(m) AS labels, properties(m) AS props, max(r.stockRatio) AS ratio
RETURN id(m) AS id, labels, props, ratio
ORDER BY ratio DESC
LIMIT 20
```

**정상 동작**:
- `WITH m`을 사용하여 **고유한 노드(m)**만 반환
- 같은 주주가 여러 번 나타나더라도 한 번만 카운트
- `LIMIT 20`으로 최대 20개만 반환 (실제로는 14개)

**결과**: 고유 노드 개수 = 14

---

## ⚠️ 근본 원인

### 문제 1: 관계 개수 vs 고유 노드 개수

**현재 로직**:
- 주주 수: `count(r)` → 관계 개수 (33)
- 연결 노드: `WITH m` → 고유 노드 개수 (14)

**불일치 이유**:
1. **데이터 중복**: 같은 주주가 여러 개의 `HOLDS_SHARES` 관계를 가질 수 있음
2. **관계 방향**: 양방향 관계가 있을 수 있음
3. **데이터 품질**: 중복 데이터 또는 잘못된 관계 생성

---

### 문제 2: 쿼리 일관성 부족

**주주 수 쿼리**:
```cypher
MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
RETURN max(r.stockRatio) AS maxRatio, count(r) AS holderCount
```
- `count(r)`: 관계 개수
- `s` (주주 노드)를 사용하지 않음

**연결 노드 쿼리**:
```cypher
MATCH (n)-[r:HOLDS_SHARES]-(m)
WHERE id(n) = $id
WITH m, ...
RETURN id(m) AS id, ...
```
- `WITH m`: 고유 노드만 선택
- `LIMIT 20`: 최대 20개

**일관성 문제**:
- 주주 수는 관계 개수를 세고 있음
- 연결 노드는 고유 노드만 세고 있음
- 두 쿼리의 기준이 다름

---

## 🎯 올바른 계산식

### 주주 수는 고유 노드 개수여야 함

**이유**:
1. **비즈니스 로직**: 주주 수는 실제 주주 개수를 의미해야 함
2. **일관성**: 연결 노드와 동일한 기준 사용
3. **정확성**: 중복 관계를 제거해야 함

---

## ✅ 수정 방안

### 옵션 1: DISTINCT 사용 (권장)

**수정 전**:
```cypher
MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
RETURN max(r.stockRatio) AS maxRatio, count(r) AS holderCount
```

**수정 후**:
```cypher
MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
WITH s, max(r.stockRatio) AS maxRatio
RETURN max(maxRatio) AS maxRatio, count(DISTINCT s) AS holderCount
```

**장점**:
- 고유한 주주만 카운트
- 연결 노드와 일관성 유지
- 간단한 수정

---

### 옵션 2: WITH 절 사용 (더 명확)

**수정 후**:
```cypher
MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
WITH DISTINCT s, max(r.stockRatio) AS maxRatio
RETURN max(maxRatio) AS maxRatio, count(s) AS holderCount
```

**장점**:
- 명시적으로 고유 노드만 선택
- 가독성 향상
- 성능 최적화 가능

---

### 옵션 3: 서브쿼리 사용 (복잡한 경우)

**수정 후**:
```cypher
MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
WITH DISTINCT s, collect(r.stockRatio) AS ratios
WITH s, max(ratios) AS maxRatio
RETURN max(maxRatio) AS maxRatio, count(s) AS holderCount
```

**장점**:
- 복잡한 로직 처리 가능
- 유연성 높음

**단점**:
- 쿼리 복잡도 증가
- 성능 저하 가능

---

## 📊 예상 결과

### 수정 전
- 주주 수: 33 (관계 개수)
- 연결 노드: 14 (고유 노드 개수)
- **불일치**: 19개 차이

### 수정 후 (옵션 1 적용)
- 주주 수: 14 (고유 노드 개수)
- 연결 노드: 14 (고유 노드 개수)
- **일치**: ✅

---

## 🔍 추가 검증 필요 사항

### 1. 데이터 품질 확인

**확인 쿼리**:
```cypher
MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
RETURN 
    count(r) AS relationshipCount,
    count(DISTINCT s) AS uniqueHolderCount,
    collect(DISTINCT id(s)) AS holderIds
```

**확인 항목**:
- 관계 개수와 고유 노드 개수 차이
- 중복 관계가 있는 주주 ID 목록
- 데이터 품질 문제 여부

---

### 2. 관계 방향 확인

**확인 쿼리**:
```cypher
MATCH (n:Company)-[r:HOLDS_SHARES]-(s)
WHERE id(n) = $id
RETURN 
    type(r) AS relationshipType,
    startNode(r) AS start,
    endNode(r) AS end,
    count(*) AS count
```

**확인 항목**:
- 양방향 관계 존재 여부
- 관계 방향 일관성
- 잘못된 관계 생성 여부

---

### 3. 연결 노드 LIMIT 영향 확인

**현재**: `LIMIT 20`으로 최대 20개만 반환

**확인 필요**:
- 실제 연결 노드가 20개 이상인 경우
- 주주 수와 연결 노드 수가 다른 이유

**확인 쿼리**:
```cypher
MATCH (n:Company)-[r:HOLDS_SHARES]-(m)
WHERE id(n) = $id
WITH DISTINCT m
RETURN count(m) AS totalConnectedNodes
```

---

## 🎯 권장 조치사항

### 즉시 조치 (P0)

1. **주주 수 계산식 수정**
   - `count(r)` → `count(DISTINCT s)` 변경
   - 고유 노드 개수로 계산

2. **쿼리 일관성 확보**
   - 주주 수와 연결 노드가 동일한 기준 사용
   - `DISTINCT` 또는 `WITH` 절 사용

---

### 단기 조치 (P1)

1. **데이터 품질 검증**
   - 중복 관계 확인
   - 데이터 정합성 검증

2. **성능 최적화**
   - 인덱스 확인
   - 쿼리 성능 측정

---

### 장기 조치 (P2)

1. **데이터 모델 개선**
   - 중복 관계 방지
   - 데이터 정합성 강화

2. **모니터링**
   - 주주 수와 연결 노드 수 일치 여부 모니터링
   - 데이터 품질 메트릭 수집

---

## 📝 수정 코드 예시

### 수정 전

```python
if node_type == "company":
    max_ratio_query = """
        MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
        WHERE id(n) = $id
        RETURN max(r.stockRatio) AS maxRatio, count(r) AS holderCount
    """
    stat_rows = graph.query(max_ratio_query, params={"id": neo4j_id})
    if stat_rows:
        max_ratio = _clamp_ratio(stat_rows[0].get("maxRatio"))
        holder_count = stat_rows[0].get("holderCount") or 0
        stats = [
            {"val": f"{float(max_ratio):.1f}%", "key": "최대주주 지분율"},
            {"val": str(int(holder_count)), "key": "주주 수"},
        ]
```

### 수정 후 (옵션 1)

```python
if node_type == "company":
    max_ratio_query = """
        MATCH (n:Company)<-[r:HOLDS_SHARES]-(s)
        WHERE id(n) = $id
        WITH DISTINCT s, max(r.stockRatio) AS maxRatio
        RETURN max(maxRatio) AS maxRatio, count(s) AS holderCount
    """
    stat_rows = graph.query(max_ratio_query, params={"id": neo4j_id})
    if stat_rows:
        max_ratio = _clamp_ratio(stat_rows[0].get("maxRatio"))
        holder_count = stat_rows[0].get("holderCount") or 0
        stats = [
            {"val": f"{float(max_ratio):.1f}%", "key": "최대주주 지분율"},
            {"val": str(int(holder_count)), "key": "주주 수"},
        ]
```

---

## ✅ 검증 체크리스트

### 수정 전 검증

- [x] 주주 수 계산식 확인 (`count(r)`)
- [x] 연결 노드 계산식 확인 (`WITH m`)
- [x] 불일치 원인 분석 완료

### 수정 후 검증

- [ ] 주주 수와 연결 노드 수 일치 확인
- [ ] 쿼리 성능 확인
- [ ] 데이터 품질 검증
- [ ] 다른 회사 노드에서도 정상 작동 확인

---

## 📚 관련 파일

### 수정 대상 파일

1. `backend/app/api/v1/endpoints/graph.py`
   - 라인 480-483: 주주 수 계산 쿼리

### 참고 파일

1. `backend/app/api/v1/endpoints/graph.py`
   - 라인 433-439: 연결 노드 계산 쿼리

---

## 🎯 결론

**문제**: 주주 수가 관계 개수를 세고 있어 연결 노드 수와 불일치

**해결**: `count(r)` → `count(DISTINCT s)` 변경하여 고유 노드 개수로 계산

**예상 결과**: 주주 수와 연결 노드 수 일치 (14개)

**우선순위**: P0 (즉시 조치 필요)
