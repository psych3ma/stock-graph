# CTO Review: 프롬프트 엔지니어링 & 그래프DB 전문가 관점

**검토자**: 프롬프트 엔지니어링 + 그래프DB 전문가 출신 CTO  
**작업 일자**: 2026-02-19  
**검토 기준**: 프롬프트 엔지니어링, Neo4j 쿼리 최적화, 데이터 포맷팅

---

## 🔍 핵심 문제

**현재**: "데이터 중복으로 보입니다" (추상적 답변)  
**기대**: "2020년 15%, 2021년 16%" (구체적 시계열 데이터)

---

## 📊 문제 분석

### 1. Cypher 쿼리 문제

**현재 예시 쿼리** (`backend/app/services/graph_service.py:90-94`):
```cypher
RETURN s.stockName AS 주주명, c.companyName AS 회사명, ratios
```

**문제점**:
- ❌ `ratios`는 리스트 구조 `[{ratio: 15.0, year: 2020}, ...]`
- ❌ LLM이 파싱하기 어려운 중첩 구조
- ❌ 연도별 정렬이 보장되지 않음

**그래프DB 전문가 권장**:
```cypher
RETURN s.stockName AS 주주명, c.companyName AS 회사명, 
       [r IN ratios | r.year] AS years,
       [r IN ratios | r.ratio] AS ratios
ORDER BY years[0] ASC
```

또는 더 명확하게:
```cypher
UNWIND ratios AS ratioItem
WITH s, c, ratioItem.year AS year, ratioItem.ratio AS ratio
ORDER BY year ASC
RETURN s.stockName AS 주주명, c.companyName AS 회사명,
       collect(year) AS years, collect(ratio) AS ratios
```

### 2. 프롬프트 엔지니어링 문제

**현재 QA_PROMPT**:
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저
- 결과가 있으면 4줄 이내 간결하게 답변
```

**문제점**:
- ❌ Few-shot 예시 부재
- ❌ 출력 형식 명시 부재
- ❌ 구조화된 데이터 처리 가이드라인 부재

---

## ✅ 해결 방안 (컴팩트)

### 해결책 1: Cypher 프롬프트 개선 (그래프DB 전문가)

**개선안**:
```
[지분율 변동 쿼리 예시]
- 시간에 따른 지분율 변동 찾기:
  MATCH (c:Company)<-[r:HOLDS_SHARES]-(s:Stockholder)
  WHERE c.companyName CONTAINS '회사명'
  WITH s, c, r ORDER BY r.reportYear ASC, r.baseDate ASC
  WITH s, c, collect(r.reportYear) AS years, collect(r.stockRatio) AS ratios
  WHERE size(years) > 1
  RETURN s.stockName AS 주주명, c.companyName AS 회사명,
         years, ratios
  ORDER BY years[0] ASC
  LIMIT 10
```

**개선점**:
- ✅ `years`와 `ratios`를 별도 리스트로 반환 (파싱 용이)
- ✅ `ORDER BY`로 시간순 정렬 보장
- ✅ LLM이 파싱하기 쉬운 평면 구조

### 해결책 2: QA_PROMPT 개선 (프롬프트 엔지니어링)

**개선안**:
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식

[시계열 데이터 답변 형식]
- DB 결과에 years, ratios 배열이 있으면:
  - 형식: "2020년 15%, 2021년 16%" (연도별 지분율)
  - 시간순으로 정렬하여 표시
  - 예시:
    * 입력: years: [2020, 2021], ratios: [15.0, 16.0]
    * 출력: "2020년 15%, 2021년 16%"
    * 입력: ratios: [{year: 2020, ratio: 15.0}, {year: 2021, ratio: 16.0}]
    * 출력: "2020년 15%, 2021년 16%"

- 추상적인 설명("데이터 중복으로 보입니다") 대신 구체적인 수치 우선 표시
- 시계열 정보가 있으면 반드시 연도별로 표시

[답변 형식]
- 시계열 데이터: "x0년 y0%, x1년 y1%" 형식 필수
- 일반 데이터: 핵심 수치 먼저, 4줄 이내 간결하게
```

**개선점**:
- ✅ Few-shot 예시 추가 (입력→출력 매핑)
- ✅ 출력 형식 명시 ("x0년 y0%, x1년 y1%")
- ✅ 구조화된 데이터 처리 가이드라인
- ✅ 추상적 설명 금지, 구체적 수치 우선

---

## 🎯 최종 권장사항

### P0 - 즉시 적용

1. **Cypher 프롬프트**: `years`, `ratios`를 별도 리스트로 반환하도록 예시 수정
2. **QA_PROMPT**: Few-shot 예시 + 출력 형식 명시 추가

### 효과

- ✅ LLM이 파싱하기 쉬운 데이터 구조
- ✅ 명확한 출력 형식 지시
- ✅ 시계열 데이터를 "2020년 15%, 2021년 16%" 형식으로 표시

---

## 📝 결론

**프롬프트 엔지니어링 관점**: Few-shot 예시와 출력 형식 명시로 해결  
**그래프DB 전문가 관점**: 쿼리 결과를 LLM이 파싱하기 쉬운 구조로 반환

**코드 수정 없이 프롬프트만 개선하면 해결 가능**
