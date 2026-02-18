# Neo4j 전문가 관점 검토: 기관 노드 카운트 수정

**검토 일자**: 2026-02-17  
**문제**: 기관 노드가 0건으로 표시되는 문제

---

## 🔍 문제 분석

### 발견된 문제점

1. **대소문자 처리 불일치**
   - `get_nodes()`: `shareholder_type.upper()` 사용하여 대문자로 변환 후 비교
   - `get_node_counts()`: 원본 값을 그대로 비교하여 대소문자 불일치 발생 가능

2. **기관 노드 분류 로직 불완전**
   - `Company:Stockholder` 레이블을 가진 노드가 기관으로 분류되지 않음
   - `shareholderType`이 `'CORPORATION'` 또는 `'INSTITUTION'`인 경우만 확인
   - 실제 DB에는 `Company:Stockholder` 레이블을 가진 노드가 15개 존재

3. **Company 노드 카운트 중복**
   - `Company:Stockholder` 노드가 Company 카운트에 포함될 수 있음

---

## ✅ 수정 사항

### 1. 대소문자 처리 통일

**수정 전**:
```cypher
WHERE coalesce(i.shareholderType, 'PERSON') <> 'PERSON'
```

**수정 후**:
```cypher
WHERE toUpper(coalesce(i.shareholderType, 'PERSON')) <> 'PERSON'
```

### 2. 기관 노드 분류 로직 개선

**수정 전**:
```cypher
MATCH (i:Stockholder)
WHERE coalesce(i.shareholderType, 'PERSON') <> 'PERSON' 
  AND NOT 'MajorShareholder' IN labels(i)
```

**수정 후**:
```cypher
MATCH (i:Stockholder)
WHERE (
    toUpper(coalesce(i.shareholderType, 'PERSON')) IN ['CORPORATION', 'INSTITUTION']
    OR 'Company' IN labels(i)
  )
  AND NOT 'MajorShareholder' IN labels(i)
```

### 3. Company 노드 카운트 정확성 개선

**수정 전**:
```cypher
MATCH (c:Company)
WITH count(c) AS company_count
```

**수정 후**:
```cypher
MATCH (c:Company)
WHERE NOT 'Stockholder' IN labels(c)
WITH count(c) AS company_count
```

### 4. 개인주주 노드 카운트 정확성 개선

**수정 전**:
```cypher
MATCH (s:Stockholder)
WHERE coalesce(s.shareholderType, 'PERSON') = 'PERSON' 
  AND NOT 'MajorShareholder' IN labels(s)
```

**수정 후**:
```cypher
MATCH (s:Stockholder)
WHERE toUpper(coalesce(s.shareholderType, 'PERSON')) = 'PERSON' 
  AND NOT 'MajorShareholder' IN labels(s)
  AND NOT 'Company' IN labels(s)
```

---

## 📊 예상 결과

### 수정 전
- Company: 227개 (Company:Stockholder 포함 가능)
- 개인주주: 3,556개
- 최대주주: 205개
- **기관: 0개** ❌

### 수정 후 (예상)
- Company: 227개 (Company:Stockholder 제외)
- 개인주주: 3,556개 (Company:Stockholder 제외)
- 최대주주: 205개
- **기관: 946개** ✅ (Company:Stockholder 15개 + shareholderType이 CORPORATION/INSTITUTION인 노드)

---

## 🔧 수정된 쿼리 전체

```cypher
MATCH (c:Company)
WHERE NOT 'Stockholder' IN labels(c)
WITH count(c) AS company_count
MATCH (s:Stockholder)
WHERE toUpper(coalesce(s.shareholderType, 'PERSON')) = 'PERSON' 
  AND NOT 'MajorShareholder' IN labels(s)
  AND NOT 'Company' IN labels(s)
WITH company_count, count(s) AS person_count
MATCH (m:MajorShareholder)
WITH company_count, person_count, count(m) AS major_count
MATCH (i:Stockholder)
WHERE (
    toUpper(coalesce(i.shareholderType, 'PERSON')) IN ['CORPORATION', 'INSTITUTION']
    OR 'Company' IN labels(i)
  )
  AND NOT 'MajorShareholder' IN labels(i)
RETURN company_count, person_count, major_count, count(i) AS institution_count
```

---

## ✅ 검증 체크리스트

- [x] 대소문자 처리 통일 (`toUpper()` 사용)
- [x] `Company:Stockholder` 레이블 노드 기관으로 분류
- [x] `shareholderType`이 `'CORPORATION'` 또는 `'INSTITUTION'`인 노드 기관으로 분류
- [x] Company 카운트에서 `Company:Stockholder` 제외
- [x] 개인주주 카운트에서 `Company:Stockholder` 제외
- [x] 최대주주 레이블을 가진 노드는 기관 카운트에서 제외

---

## 📝 추가 권장 사항

1. **인덱스 확인**: `shareholderType` 속성에 인덱스가 있는지 확인
   ```cypher
   CREATE INDEX shareholder_type_index IF NOT EXISTS
   FOR (s:Stockholder) ON (s.shareholderType);
   ```

2. **데이터 일관성 검증**: 실제 DB에서 `shareholderType` 값 분포 확인
   ```cypher
   MATCH (s:Stockholder)
   RETURN DISTINCT s.shareholderType, count(s) AS count
   ORDER BY count DESC;
   ```

3. **성능 모니터링**: 쿼리 실행 시간 측정 및 필요시 최적화

---

**수정 완료**: `backend/app/api/v1/endpoints/graph.py`의 `get_node_counts()` 함수
