# CTO Review: AI 질문 기능 데이터 검색 및 LLM 폴백 문제

**검토자**: 그래프 DB 전문가 출신 CTO  
**작업 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 문제 분석

### 사용자 질문

**질문**: "지분율 변동이 있었던 주주는?" (Which shareholders had fluctuations in their shareholding ratio?)

**시스템 응답**: "해당 데이터가 없습니다. '우리금융지주(주)'에 대한 지분율 변동이 있었던 주주 정보는 확인할 수 없습니다."

**문제점**:
1. 주주 정보에 '지분율'(`stockRatio`)과 '기준일자'(`baseDate`, `reportYear`)가 있어서 그래프에서 찾을 수 있어야 함
2. 결과가 없을 때 LLM이 더 분석하거나 대안을 제시해야 함

---

## 근본 원인 분석

### 문제 1: Cypher 프롬프트에 지분율 변동 쿼리 예시 부족

**현재 Cypher 프롬프트** (`backend/app/services/graph_service.py:55-86`):
```
[관계]
- (s:Stockholder)-[:HOLDS_SHARES]->(c:Company)
    stockRatio(Float, 지분율%), stockCount(Int), stockType(보통주|우선주), baseDate(Date), reportYear(Int)

[작성 규칙]
1. 주주명 속성은 stockName (name 아님)
2. 회사명 검색 → CONTAINS  예) c.companyName CONTAINS '삼성'
3. 지분율 비교 → Float  예) r.stockRatio >= 50.0
4. 금액 단위 만원, 1억=10000, LIMIT 기본 10
5. Cypher 코드만 반환 — 설명·마크다운 금지
```

**문제점**:
- `baseDate`와 `reportYear` 속성이 언급되어 있지만, 이를 활용한 **지분율 변동 쿼리 예시가 없음**
- LLM이 시간에 따른 지분율 변동을 찾는 방법을 모름
- GROUP BY, ORDER BY를 사용한 시계열 분석 쿼리 예시 부족

**필요한 쿼리 패턴**:
```cypher
// 지분율 변동이 있었던 주주 찾기
MATCH (c:Company)<-[r:HOLDS_SHARES]-(s:Stockholder)
WHERE c.companyName CONTAINS '우리금융지주'
WITH s, c, collect({ratio: r.stockRatio, date: r.baseDate, year: r.reportYear}) AS ratios
WHERE size(ratios) > 1
WITH s, c, ratios,
     [r IN ratios | r.ratio] AS ratioList
WHERE any(i IN range(0, size(ratioList)-2) WHERE ratioList[i] <> ratioList[i+1])
RETURN s.stockName AS 주주명, c.companyName AS 회사명, ratios
ORDER BY size(ratios) DESC
LIMIT 10
```

### 문제 2: QA 프롬프트가 빈 결과를 제대로 처리하지 않음

**현재 QA 프롬프트** (`backend/app/services/graph_service.py:88-103`):
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식
- 결과 없으면 "해당 데이터가 없습니다" 안내, 4줄 이내 간결하게
```

**문제점**:
- 빈 결과를 받으면 단순히 "데이터 없음"이라고만 답변
- LLM이 **왜 데이터가 없는지 분석하지 않음**
- **대안 쿼리나 다른 접근 방법을 제시하지 않음**
- 사용자가 원하는 정보를 찾을 수 있는 다른 방법을 제안하지 않음

**필요한 개선**:
- 빈 결과일 때 LLM이 더 분석하도록 프롬프트 개선
- 대안 쿼리 제안
- 데이터가 없는 이유 분석 (쿼리 문제인지, 실제 데이터 부재인지)

### 문제 3: 결과 처리 로직의 LLM 폴백 부족

**현재 로직** (`backend/app/services/graph_service.py:200-208`):
```python
if cypher and raw:
    source, confidence = "DB", "HIGH"
elif cypher and not raw:
    source, confidence = "DB_EMPTY", "MEDIUM"
else:
    source, confidence = "LLM", "LOW"
    # DB 조회 실패 시에만 LLM 추론 메시지 추가
    if not answer.startswith("⚠️"):
        answer = f"⚠️ DB 조회에 실패하여 LLM 추론으로 답변합니다. 실제 데이터와 다를 수 있습니다.\n\n{answer}"
```

**문제점**:
- `cypher and not raw` (쿼리는 생성되었지만 결과 없음)일 때 LLM이 추가 분석하지 않음
- 단순히 "DB_EMPTY"로 표시하고 끝
- LLM이 쿼리를 개선하거나 대안을 제시하지 않음

---

## 해결 방안

### 해결책 1: Cypher 프롬프트에 지분율 변동 쿼리 예시 추가

**개선안**:
```python
CYPHER_PROMPT = PromptTemplate(
    input_variables=["schema", "question"],
    template="""당신은 Neo4j Cypher 전문가입니다.
아래 스키마와 도메인 지식을 참고하여 사용자 질문에 맞는 Cypher를 작성하세요.

## DB 스키마
{schema}

## 도메인 지식 (반드시 준수)
[노드]
- (c:Company:LegalEntity)  bizno, companyName, isActive(bool), closedDate(Date)
- (p:Person:Stockholder)   personId, stockName(주주명), shareholderType='PERSON'
- (x:Company:Stockholder)  법인 주주  shareholderType='CORPORATION'|'INSTITUTION'
- (:MajorShareholder)      maxStockRatio >= 5% 인 주주

[관계]
- (s:Stockholder)-[:HOLDS_SHARES]->(c:Company)
    stockRatio(Float, 지분율%), stockCount(Int), stockType(보통주|우선주), baseDate(Date), reportYear(Int)
- (c:Company)-[:HAS_COMPENSATION]->(c:Company)
    fiscalYear(Int), registeredExecCount(Int), registeredExecTotalComp(Int, 만원), outsideDirectorCount(Int) 등

[작성 규칙]
1. 주주명 속성은 stockName (name 아님)
2. 회사명 검색 → CONTAINS  예) c.companyName CONTAINS '삼성'
3. 지분율 비교 → Float  예) r.stockRatio >= 50.0
4. 금액 단위 만원, 1억=10000, LIMIT 기본 10
5. Cypher 코드만 반환 — 설명·마크다운 금지

[지분율 변동 쿼리 예시]
- 시간에 따른 지분율 변동 찾기:
  MATCH (c:Company)<-[r:HOLDS_SHARES]-(s:Stockholder)
  WHERE c.companyName CONTAINS '회사명'
  WITH s, c, collect({{ratio: r.stockRatio, date: r.baseDate, year: r.reportYear}}) AS ratios
  WHERE size(ratios) > 1
  WITH s, c, ratios, [r IN ratios | r.ratio] AS ratioList
  WHERE any(i IN range(0, size(ratioList)-2) WHERE ratioList[i] <> ratioList[i+1])
  RETURN s.stockName AS 주주명, c.companyName AS 회사명, ratios
  ORDER BY size(ratios) DESC
  LIMIT 10

- 특정 기간 지분율 변동:
  MATCH (c:Company)<-[r:HOLDS_SHARES]-(s:Stockholder)
  WHERE c.companyName CONTAINS '회사명' AND r.reportYear >= 2020
  WITH s, c, r ORDER BY r.reportYear, r.baseDate
  WITH s, c, collect(r.stockRatio) AS ratios, collect(r.reportYear) AS years
  WHERE size(ratios) > 1 AND any(i IN range(0, size(ratios)-2) WHERE ratios[i] <> ratios[i+1])
  RETURN s.stockName AS 주주명, c.companyName AS 회사명, ratios, years
  LIMIT 10

질문: {question}

Cypher:""".strip(),
)
```

### 해결책 2: QA 프롬프트 개선 (빈 결과 처리 강화)

**개선안**:
```python
QA_PROMPT = PromptTemplate(
    input_variables=["context", "question"],
    template="""당신은 주주 네트워크 분석 전문가입니다.
DB 조회 결과를 바탕으로 질문에 명확하고 친절하게 답변하세요.

질문: {question}

DB 결과:
{context}

[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식
- 결과가 비어있거나 없으면:
  1. 왜 데이터가 없는지 분석 (쿼리 문제인지, 실제 데이터 부재인지)
  2. 대안 쿼리나 다른 접근 방법 제시
  3. 사용자가 원하는 정보를 찾을 수 있는 다른 방법 제안
  4. 예: "지분율 변동을 찾으려면 baseDate나 reportYear로 시간순 정렬하여 비교해야 합니다. 특정 회사나 기간을 지정해보시겠어요?"
- 결과가 있으면 4줄 이내 간결하게 답변

답변:""".strip(),
)
```

### 해결책 3: 결과 처리 로직 개선 (LLM 폴백 강화)

**개선안**:
```python
if cypher and raw:
    source, confidence = "DB", "HIGH"
elif cypher and not raw:
    # CTO: 쿼리는 생성되었지만 결과 없음 - LLM이 추가 분석하도록 재호출
    source, confidence = "DB_EMPTY", "MEDIUM"
    
    # LLM에게 빈 결과에 대한 추가 분석 요청
    if not answer.startswith("⚠️"):
        # 빈 결과에 대한 추가 분석 프롬프트
        analysis_prompt = f"""다음 질문에 대한 Cypher 쿼리를 실행했지만 결과가 없습니다.

질문: {question}
생성된 Cypher: {cypher}

다음을 분석해주세요:
1. 왜 결과가 없을 수 있는지 (쿼리 문제인지, 실제 데이터 부재인지)
2. 대안 쿼리나 다른 접근 방법
3. 사용자가 원하는 정보를 찾을 수 있는 다른 방법

답변:"""
        
        try:
            llm = ChatOpenAI(model=s.LLM_MODEL, temperature=0, max_tokens=512, api_key=s.OPENAI_API_KEY)
            analysis_result = llm.invoke(analysis_prompt)
            answer = f"{answer}\n\n💡 추가 분석:\n{analysis_result.content}"
        except Exception as e:
            logger.warning(f"LLM 추가 분석 실패: {e}")
else:
    source, confidence = "LLM", "LOW"
    if not answer.startswith("⚠️"):
        answer = f"⚠️ DB 조회에 실패하여 LLM 추론으로 답변합니다. 실제 데이터와 다를 수 있습니다.\n\n{answer}"
```

---

## 호환성 검토

### Neo4j 호환성

**확인 사항**:
- `collect()` 함수 사용: ✅ Neo4j 4.x+ 지원
- `range()` 함수 사용: ✅ Neo4j 4.x+ 지원
- `any()` 함수 사용: ✅ Neo4j 4.x+ 지원

**결과**: ✅ 호환성 유지

### LangChain 호환성

**확인 사항**:
- `GraphCypherQAChain` 동작 유지
- 프롬프트 수정으로 인한 호환성 문제 없음

**결과**: ✅ 호환성 유지

---

## 일관성 검토

### 프롬프트 일관성

**개선 사항**:
- Cypher 프롬프트에 쿼리 예시 추가로 일관성 향상
- QA 프롬프트 개선으로 빈 결과 처리 일관성 향상

**결과**: ✅ 일관성 향상

---

## 유지보수성 검토

### 프롬프트 관리

**개선 사항**:
- 쿼리 예시를 프롬프트에 명시하여 유지보수 용이
- 새로운 쿼리 패턴 추가 시 프롬프트만 수정

**결과**: ✅ 유지보수성 향상

---

## 확장성 검토

### 새로운 쿼리 패턴 추가

**개선 사항**:
- 프롬프트에 쿼리 예시 추가로 새로운 패턴 학습 용이
- LLM이 예시를 참고하여 유사한 쿼리 생성 가능

**결과**: ✅ 확장성 향상

---

## 협업 코드 검토

### 문서화

**개선 사항**:
- 프롬프트에 쿼리 예시 명시로 다른 개발자가 이해하기 쉬움
- 빈 결과 처리 로직 명확화

**결과**: ✅ 협업 코드 품질 향상

---

## 권장 사항

### P0 - Critical (즉시 개선)

1. **Cypher 프롬프트에 지분율 변동 쿼리 예시 추가**
   - 시간에 따른 지분율 변동 찾기 예시
   - 특정 기간 지분율 변동 예시

2. **QA 프롬프트 개선**
   - 빈 결과일 때 LLM이 더 분석하도록 프롬프트 개선
   - 대안 쿼리 제안 요청

### P1 - High (단기 개선)

3. **결과 처리 로직 개선**
   - 빈 결과일 때 LLM 추가 분석 호출
   - 대안 쿼리 제안

4. **에러 처리 강화**
   - 쿼리 생성 실패 시 더 명확한 에러 메시지
   - LLM이 쿼리를 개선할 수 있도록 재시도 로직

---

## 관련 파일

### 백엔드
- `backend/app/services/graph_service.py`: `_get_qa_chain()`, `ask_graph()` 함수

### 문서
- `docs/CTO-AI-QUESTION-ARCHITECTURE.md`: 초기 아키텍처 문서
- `docs/CTO-AI-QUESTION-DATA-SEARCH-REVIEW.md`: 본 문서
