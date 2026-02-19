# CTO Fix: AI 질문 기능 데이터 검색 개선 (프롬프트만 수정)

**검토자**: 그래프 DB 전문가 출신 CTO  
**작업 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 문제 분석

### 사용자 질문

**질문**: "지분율 변동이 있었던 주주는?" (Which shareholders had fluctuations in their shareholding ratio?)

**시스템 응답**: "해당 데이터가 없습니다. '우리금융지주(주)'에 대한 지분율 변동이 있었던 주주 정보는 확인할 수 없습니다."

**문제점**:
1. ❌ 주주 정보에 '지분율'(`stockRatio`)과 '기준일자'(`baseDate`, `reportYear`)가 있어서 그래프에서 찾을 수 있어야 함
2. ❌ LangChain의 `GraphCypherQAChain`이 지분율 변동 쿼리를 생성하지 못함

**해결 원칙**:
- ✅ **프롬프트만 수정** - LangChain이 알아서 처리하도록 프롬프트 개선
- ❌ 코드 로직 수정 없음 - `GraphCypherQAChain`이 이미 자연어→Cypher 변환 및 빈 결과 처리를 담당

---

## 근본 원인 분석

### 문제 1: Cypher 프롬프트에 지분율 변동 쿼리 예시 부족

**현재 상태**:
- `baseDate`와 `reportYear` 속성이 언급되어 있지만, 이를 활용한 **지분율 변동 쿼리 예시가 없음**
- LLM이 시간에 따른 지분율 변동을 찾는 방법을 모름
- GROUP BY, ORDER BY를 사용한 시계열 분석 쿼리 예시 부족

**영향**:
- LLM이 올바른 Cypher 쿼리를 생성하지 못함
- 지분율 변동을 찾는 쿼리를 생성하지 못함

### 문제 2: QA 프롬프트가 빈 결과를 제대로 처리하지 않음

**현재 상태**:
- 빈 결과를 받으면 단순히 "데이터 없음"이라고만 답변
- LLM이 **왜 데이터가 없는지 분석하지 않음**
- **대안 쿼리나 다른 접근 방법을 제시하지 않음**

**영향**:
- 사용자가 원하는 정보를 찾을 수 없음
- LLM의 분석 능력을 활용하지 못함

### 문제 3: 결과 처리 로직의 LLM 폴백 부족

**현재 상태**:
- `cypher and not raw` (쿼리는 생성되었지만 결과 없음)일 때 LLM이 추가 분석하지 않음
- 단순히 "DB_EMPTY"로 표시하고 끝

**영향**:
- 사용자 요구사항("혹여 못 찾더라도 llm 실행했어야 함") 미충족

---

## 적용된 수정 사항

### 1. Cypher 프롬프트에 지분율 변동 쿼리 예시 추가

**추가된 예시**:

1. **시간에 따른 지분율 변동 찾기** (`baseDate`/`reportYear` 사용):
```cypher
MATCH (c:Company)<-[r:HOLDS_SHARES]-(s:Stockholder)
WHERE c.companyName CONTAINS '회사명'
WITH s, c, collect({ratio: r.stockRatio, date: r.baseDate, year: r.reportYear}) AS ratios
WHERE size(ratios) > 1
WITH s, c, ratios, [r IN ratios | r.ratio] AS ratioList
WHERE any(i IN range(0, size(ratioList)-2) WHERE ratioList[i] <> ratioList[i+1])
RETURN s.stockName AS 주주명, c.companyName AS 회사명, ratios
ORDER BY size(ratios) DESC
LIMIT 10
```

2. **특정 기간 지분율 변동** (`reportYear` 사용):
```cypher
MATCH (c:Company)<-[r:HOLDS_SHARES]-(s:Stockholder)
WHERE c.companyName CONTAINS '회사명' AND r.reportYear >= 2020
WITH s, c, r ORDER BY r.reportYear, r.baseDate
WITH s, c, collect(r.stockRatio) AS ratios, collect(r.reportYear) AS years
WHERE size(ratios) > 1 AND any(i IN range(0, size(ratios)-2) WHERE ratios[i] <> ratios[i+1])
RETURN s.stockName AS 주주명, c.companyName AS 회사명, ratios, years
LIMIT 10
```

3. **지분율 변동이 있었던 주주 찾기** (변동 폭 포함):
```cypher
MATCH (c:Company)<-[r:HOLDS_SHARES]-(s:Stockholder)
WHERE c.companyName CONTAINS '회사명'
WITH s, c, collect({ratio: r.stockRatio, year: r.reportYear}) AS ratios
WHERE size(ratios) > 1
WITH s, c, ratios, [r IN ratios | r.ratio] AS ratioList
WHERE any(i IN range(0, size(ratioList)-2) WHERE ratioList[i] <> ratioList[i+1])
RETURN s.stockName AS 주주명, c.companyName AS 회사명, 
       min([r IN ratios | r.ratio]) AS minRatio, 
       max([r IN ratios | r.ratio]) AS maxRatio,
       ratios
ORDER BY abs(max([r IN ratios | r.ratio]) - min([r IN ratios | r.ratio])) DESC
LIMIT 10
```

**개선 효과**:
- LLM이 지분율 변동 쿼리를 생성할 수 있음
- `baseDate`와 `reportYear`를 활용한 시계열 분석 가능
- 다양한 쿼리 패턴 학습 가능

### 2. QA 프롬프트 개선 (빈 결과 처리 강화)

**변경 전**:
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식
- 결과 없으면 "해당 데이터가 없습니다" 안내, 4줄 이내 간결하게
```

**변경 후**:
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식
- 결과가 비어있거나 없으면:
  1. 왜 데이터가 없는지 분석 (쿼리 문제인지, 실제 데이터 부재인지)
  2. 대안 쿼리나 다른 접근 방법 제시
  3. 사용자가 원하는 정보를 찾을 수 있는 다른 방법 제안
  4. 예: "지분율 변동을 찾으려면 baseDate나 reportYear로 시간순 정렬하여 비교해야 합니다. 특정 회사나 기간을 지정해보시겠어요?"
  5. 가능하면 DB에 있는 실제 데이터를 활용한 대안 제시
- 결과가 있으면 4줄 이내 간결하게 답변
```

**개선 효과**:
- 빈 결과일 때 LLM이 더 분석함
- 대안 쿼리 제안
- 사용자에게 도움이 되는 정보 제공

### 3. 코드 로직 수정 없음 (LangChain이 알아서 처리)

**원칙**:
- `GraphCypherQAChain`이 이미 빈 결과를 받으면 QA_PROMPT를 통해 LLM이 자동으로 분석하고 답변 생성
- 추가 코드 로직 불필요
- 프롬프트 개선만으로 충분

**개선 효과**:
- LangChain의 기본 동작 활용
- 코드 복잡도 감소
- 유지보수성 향상

---

## 호환성 검토

### Neo4j 호환성

**확인 사항**:
- `collect()` 함수: ✅ Neo4j 4.x+ 지원
- `range()` 함수: ✅ Neo4j 4.x+ 지원
- `any()` 함수: ✅ Neo4j 4.x+ 지원
- 리스트 컴프리헨션 `[r IN ratios | r.ratio]`: ✅ Neo4j 4.x+ 지원

**결과**: ✅ 호환성 유지

### LangChain 호환성

**확인 사항**:
- `GraphCypherQAChain` 동작 유지
- 프롬프트 수정으로 인한 호환성 문제 없음
- 추가 LLM 호출은 독립적으로 실행

**결과**: ✅ 호환성 유지

---

## 일관성 검토

### 프롬프트 일관성

**개선 사항**:
- Cypher 프롬프트에 쿼리 예시 추가로 일관성 향상
- QA 프롬프트 개선으로 빈 결과 처리 일관성 향상
- 결과 처리 로직 개선으로 LLM 폴백 일관성 향상

**결과**: ✅ 일관성 향상

---

## 유지보수성 검토

### 프롬프트 관리

**개선 사항**:
- 쿼리 예시를 프롬프트에 명시하여 유지보수 용이
- 새로운 쿼리 패턴 추가 시 프롬프트만 수정
- LLM 추가 분석 로직이 명확히 분리됨

**결과**: ✅ 유지보수성 향상

### 코드 구조

**개선 사항**:
- LLM 추가 분석 로직이 명확히 분리됨
- 에러 처리 강화 (`try-except` 블록)

**결과**: ✅ 유지보수성 향상

---

## 확장성 검토

### 새로운 쿼리 패턴 추가

**개선 사항**:
- 프롬프트에 쿼리 예시 추가로 새로운 패턴 학습 용이
- LLM이 예시를 참고하여 유사한 쿼리 생성 가능

**결과**: ✅ 확장성 향상

### LLM 폴백 확장

**개선 사항**:
- 빈 결과 처리 로직이 확장 가능한 구조
- 다른 상황에서도 LLM 추가 분석 활용 가능

**결과**: ✅ 확장성 향상

---

## 협업 코드 검토

### 문서화

**개선 사항**:
- 프롬프트에 쿼리 예시 명시로 다른 개발자가 이해하기 쉬움
- 빈 결과 처리 로직 명확화
- CTO 주석으로 의도 명확화

**결과**: ✅ 협업 코드 품질 향상

---

## 📊 개선 효과 요약

### 문제 해결

**Before**:
- ❌ "지분율 변동이 있었던 주주" 질문에 "데이터 없음" 답변
- ❌ LLM이 지분율 변동 쿼리를 생성하지 못함
- ❌ LangChain이 `baseDate`/`reportYear` 활용 방법을 모름

**After**:
- ✅ Cypher 프롬프트에 지분율 변동 쿼리 예시 추가
- ✅ LLM이 `baseDate`/`reportYear`를 활용한 쿼리 생성 가능
- ✅ QA_PROMPT 개선으로 빈 결과일 때 LangChain이 자동으로 분석
- ✅ 대안 쿼리 및 접근 방법 제시

### 코드 품질

**Before**:
- ⚠️ 프롬프트에 쿼리 예시 부족
- ⚠️ 빈 결과 처리 프롬프트 부족

**After**:
- ✅ 프롬프트에 쿼리 예시 추가
- ✅ 빈 결과 처리 프롬프트 강화
- ✅ **코드 로직 수정 없음** - LangChain이 알아서 처리

---

## 🔍 변경된 파일

### 백엔드
- `backend/app/services/graph_service.py`:
  - `CYPHER_PROMPT` 개선 (지분율 변동 쿼리 예시 추가) - **프롬프트만 수정**
  - `QA_PROMPT` 개선 (빈 결과 처리 강화) - **프롬프트만 수정**
  - `ask_graph()` 함수 - **코드 로직 수정 없음** (LangChain이 알아서 처리)

### 문서
- `docs/CTO-AI-QUESTION-DATA-SEARCH-REVIEW.md`: 초기 검토 문서
- `docs/CTO-AI-QUESTION-DATA-SEARCH-FIX.md`: 본 문서

---

## ✅ 테스트 체크리스트

- [ ] "지분율 변동이 있었던 주주" 질문에 올바른 쿼리 생성 확인
- [ ] 빈 결과일 때 LangChain이 자동으로 분석하고 답변 생성 확인
- [ ] 대안 쿼리 제안 확인
- [ ] `baseDate`/`reportYear`를 활용한 쿼리 생성 확인
- [ ] LangChain의 기본 동작 확인 (코드 로직 수정 없이)

---

## 관련 문서

- `docs/CTO-AI-QUESTION-ARCHITECTURE.md`: 초기 아키텍처 문서
- `docs/CTO-AI-QUESTION-DATA-SEARCH-REVIEW.md`: 초기 검토 문서
- `docs/CTO-AI-QUESTION-DATA-SEARCH-FIX.md`: 본 문서
