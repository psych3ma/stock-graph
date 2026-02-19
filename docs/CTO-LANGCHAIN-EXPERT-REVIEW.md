# CTO Review: LangChain 전문가 관점 검토

**검토자**: LangChain 전문가 출신 CTO  
**작업 일자**: 2026-02-19  
**검토 기준**: LangChain 아키텍처, 프롬프트 엔지니어링, 체인 설계, 데이터 흐름

---

## 📋 LangChain 아키텍처 분석

### GraphCypherQAChain의 동작 방식

**현재 구현** (`backend/app/services/graph_service.py:152-161`):
```python
_qa_chain = GraphCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    cypher_prompt=CYPHER_PROMPT,
    qa_prompt=QA_PROMPT,
    verbose=False,
    return_intermediate_steps=True,
    allow_dangerous_requests=True,
    top_k=10,
)
```

**LangChain 체인 구조**:
1. **Cypher Generation Stage**: `CYPHER_PROMPT`를 사용하여 자연어 → Cypher 변환
2. **Query Execution**: 생성된 Cypher를 Neo4j에서 실행
3. **Context Formatting**: 쿼리 결과를 `context` 변수로 포맷팅
4. **Answer Generation**: `QA_PROMPT`를 사용하여 `context` → 자연어 답변 생성

---

## 🔍 핵심 문제 분석

### 문제 1: Context 포맷팅이 불명확함

**현재 상황**:
- `GraphCypherQAChain`이 Neo4j 쿼리 결과를 `context`로 전달
- 하지만 **어떤 형식으로 포맷팅되는지 명확하지 않음**
- `intermediate_steps`에서 `ctx = step.get("context")`로 추출하지만, 실제 포맷을 확인하지 않음

**LangChain 전문가 관점**:
- `GraphCypherQAChain`은 기본적으로 쿼리 결과를 **문자열로 변환**하여 전달
- 복잡한 구조(리스트, 맵 등)는 JSON 문자열로 직렬화될 수 있음
- `ratios` 같은 리스트 구조가 `[{ratio: 15.0, year: 2020}, {ratio: 16.0, year: 2021}]` 형식으로 전달될 수 있음

**문제점**:
- QA_PROMPT가 이 형식을 파싱하고 포맷팅하는 방법을 모름
- LLM이 JSON 구조를 이해하더라도, "2020년 15%, 2021년 16%" 형식으로 변환하라는 지시가 없음

### 문제 2: 프롬프트 엔지니어링 관점의 부족

**현재 QA_PROMPT**:
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식
- 결과가 있으면 4줄 이내 간결하게 답변
```

**LangChain 전문가 관점**:
- ❌ **구체적인 출력 형식(Output Format) 명시 부재**
- ❌ **Few-shot 예시 부재**: LLM이 학습할 수 있는 구체적인 예시가 없음
- ❌ **구조화된 데이터 처리 가이드라인 부재**: JSON/리스트 구조를 어떻게 파싱해야 하는지 불명확

**필요한 개선**:
1. **Few-shot 예시 추가**: "DB 결과에 `ratios: [{year: 2020, ratio: 15.0}, {year: 2021, ratio: 16.0}]`가 있으면 '2020년 15%, 2021년 16%' 형식으로 답변"
2. **출력 형식 명시**: 시계열 데이터의 경우 반드시 "x0년 y0%, x1년 y1%" 형식 사용
3. **구조화된 데이터 처리 지시**: JSON/리스트 구조를 파싱하여 연도별로 정렬

### 문제 3: Context 전달 방식의 한계

**현재 코드** (`backend/app/services/graph_service.py:220-225`):
```python
for step in result.get("intermediate_steps", []):
    if isinstance(step, dict):
        cypher = cypher or step.get("query", "")
        ctx = step.get("context")
        if ctx is not None and not raw:
            raw = ctx if isinstance(ctx, list) else [{"result": ctx}]
```

**LangChain 전문가 관점**:
- `intermediate_steps`의 `context`는 **문자열 형식**일 가능성이 높음
- Neo4j 쿼리 결과가 JSON 문자열로 직렬화되어 전달됨
- LLM이 이 문자열을 파싱하고 이해해야 함

**문제점**:
- LLM이 JSON 문자열을 파싱하는 데 실패할 수 있음
- 구조화된 데이터를 자연어로 변환하는 과정에서 정보 손실 가능
- 시계열 데이터의 순서가 보장되지 않을 수 있음

---

## 💡 LangChain 전문가 권장 사항

### 권장사항 1: Few-shot Learning 활용

**개선안**:
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식

[시계열 데이터 답변 예시]
DB 결과에 reportYear나 baseDate가 포함된 경우:
- 입력: ratios: [{year: 2020, ratio: 15.0}, {year: 2021, ratio: 16.0}]
- 출력: "2020년 15%, 2021년 16%"
- 입력: years: [2020, 2021], ratios: [15.0, 16.0]
- 출력: "2020년 15%, 2021년 16%"

[답변 형식]
- 시계열 데이터는 반드시 "x0년 y0%, x1년 y1%" 형식 사용
- 시간순으로 정렬하여 표시
- 각 연도/기준일자별 지분율을 명확히 구분
```

**효과**:
- ✅ Few-shot 예시로 LLM이 원하는 형식을 학습
- ✅ 구조화된 데이터 처리 방법 명시
- ✅ 출력 형식 일관성 확보

### 권장사항 2: Output Parser 활용 고려

**LangChain 전문가 관점**:
- 현재는 `GraphCypherQAChain`의 기본 동작에 의존
- 더 정교한 제어가 필요하면 **Custom Chain** 또는 **Output Parser** 활용 고려

**개선안** (선택사항):
```python
from langchain.output_parsers import StructuredOutputParser
from langchain.prompts import PromptTemplate

# Output Parser 정의
output_parser = StructuredOutputParser.from_response_schemas([
    {"name": "answer", "description": "자연어 답변"},
    {"name": "time_series", "description": "시계열 데이터 (연도별 지분율)"}
])

# QA_PROMPT에 format_instructions 추가
format_instructions = output_parser.get_format_instructions()
QA_PROMPT = PromptTemplate(
    template="""...
    {format_instructions}
    ...""",
    ...
)
```

**효과**:
- ✅ 구조화된 출력 보장
- ✅ 시계열 데이터를 별도 필드로 추출 가능
- ✅ 파싱 오류 감소

**단점**:
- ✅ 복잡도 증가
- ✅ 현재 구조 변경 필요

### 권장사항 3: Context 전처리 고려

**LangChain 전문가 관점**:
- `GraphCypherQAChain`의 `context` 전달 전에 **전처리** 가능
- Custom Chain을 만들어서 context를 포맷팅할 수 있음

**개선안** (선택사항):
```python
from langchain.chains.base import Chain

class TimeSeriesFormatterChain(Chain):
    """시계열 데이터를 포맷팅하는 커스텀 체인"""
    
    def _call(self, inputs):
        context = inputs.get("context", "")
        # JSON 파싱 및 포맷팅
        formatted_context = self._format_time_series(context)
        return {"formatted_context": formatted_context}
```

**효과**:
- ✅ LLM이 파싱할 필요 없이 이미 포맷팅된 데이터 제공
- ✅ 답변 품질 향상
- ✅ 토큰 사용량 감소

**단점**:
- ✅ 추가 개발 필요
- ✅ 유지보수 복잡도 증가

### 권장사항 4: 프롬프트 구조화 강화 (가장 실용적)

**LangChain 전문가 관점**:
- **프롬프트 엔지니어링**만으로도 충분히 해결 가능
- Few-shot 예시와 명확한 출력 형식 지시로 해결

**개선안**:
```
[답변 규칙]
- 핵심 수치(지분율·금액·건수) 먼저, 금액은 "X억 X천만원" 형식

[시계열 데이터 처리 규칙]
1. DB 결과에 reportYear, baseDate, ratios 등 시계열 정보가 있으면:
   - 반드시 연도별로 정렬하여 표시
   - 형식: "2020년 15%, 2021년 16%" (연도별 지분율)
   - 각 연도와 지분율을 명확히 매칭

2. 예시:
   - 입력: ratios: [{year: 2020, ratio: 15.0}, {year: 2021, ratio: 16.0}]
   - 출력: "2020년 15%, 2021년 16%"
   
   - 입력: years: [2020, 2021], ratios: [15.0, 16.0]
   - 출력: "2020년 15%, 2021년 16%"

3. 추상적인 설명("데이터 중복으로 보입니다") 대신 구체적인 수치 우선 표시

[답변 형식]
- 시계열 데이터: "x0년 y0%, x1년 y1%" 형식 필수
- 일반 데이터: 핵심 수치 먼저, 4줄 이내 간결하게
```

**효과**:
- ✅ 코드 수정 없이 프롬프트만 개선
- ✅ Few-shot 예시로 LLM 학습
- ✅ 출력 형식 명확화
- ✅ 구현 복잡도 최소화

---

## 📊 LangChain 아키텍처 관점 평가

### 현재 구현의 강점

1. ✅ **표준 LangChain 패턴 사용**: `GraphCypherQAChain` 활용
2. ✅ **중간 단계 추적**: `return_intermediate_steps=True`로 디버깅 가능
3. ✅ **프롬프트 커스터마이징**: `cypher_prompt`, `qa_prompt` 커스터마이징
4. ✅ **대화 이력 관리**: `chat_history` 활용

### 현재 구현의 약점

1. ❌ **Context 포맷팅 불명확**: 쿼리 결과가 어떤 형식으로 전달되는지 불명확
2. ❌ **Few-shot 예시 부재**: LLM이 학습할 수 있는 구체적인 예시 없음
3. ❌ **출력 형식 명시 부재**: 시계열 데이터 포맷팅 규칙 없음
4. ❌ **구조화된 데이터 처리 가이드라인 부재**: JSON/리스트 파싱 방법 불명확

---

## 🎯 LangChain 전문가 최종 권장사항

### 즉시 적용 가능 (P0)

**1. QA_PROMPT에 Few-shot 예시 추가**
- 시계열 데이터 처리 예시 명시
- "x0년 y0%, x1년 y1%" 형식 예시 제공

**2. 출력 형식 명시**
- 시계열 데이터의 경우 반드시 연도별 표시
- 구조화된 데이터 처리 방법 명시

**3. Context 활용 강화**
- DB 결과를 추상적으로 설명하지 말고 구체적인 수치 우선 표시
- 시계열 정보가 있으면 반드시 활용

### 중기 개선 (P1)

**4. Output Parser 활용 고려**
- 구조화된 출력이 필요하면 `StructuredOutputParser` 활용
- 시계열 데이터를 별도 필드로 추출

**5. Custom Chain 고려**
- Context 전처리가 필요하면 Custom Chain 활용
- 시계열 데이터 포맷팅을 체인 단계에서 처리

---

## 📝 결론

**LangChain 전문가 관점**:
- 현재 구현은 **표준 LangChain 패턴을 잘 따르고 있음**
- 문제는 **프롬프트 엔지니어링** 부족
- **Few-shot 예시와 명확한 출력 형식 지시**만으로도 충분히 해결 가능
- 코드 수정 없이 **프롬프트 개선만으로도 해결 가능**

**가장 실용적인 해결책**:
- QA_PROMPT에 시계열 데이터 처리 Few-shot 예시 추가
- 출력 형식 명시 ("x0년 y0%, x1년 y1%" 형식 필수)
- 구조화된 데이터 처리 가이드라인 추가

이렇게 하면 LangChain의 기본 동작을 활용하면서도 원하는 답변 형식을 얻을 수 있습니다.

---

## 관련 문서

- `docs/CTO-AI-ANSWER-FORMAT-REVIEW.md`: 초기 답변 형식 문제 분석
- `docs/CTO-LANGCHAIN-EXPERT-REVIEW.md`: 본 문서
