# Neo4j 전문가 관점 이슈 해결 보고서

## 작성일
2026-02-17

## 검토자
Neo4j 전문가 + UX 전문가 출신 CTO

---

## 발견된 이슈 및 해결

### 🔴 P0-1: DB값 표출 이슈 - `6662.2% (11건)` 같은 비정상적 지분율

#### 문제 분석
- **증상**: 엣지 라벨에 `662.2% (11건)` 또는 `6662.2% (11건)` 같은 100%를 초과하는 지분율 표시
- **근본 원인**:
  1. **백엔드**: Neo4j에서 같은 `(Stockholder)-[:HOLDS_SHARES]->(Company)` 관계가 **리포트연도/기준일/주식종류 등으로 여러 건 존재**할 수 있음
  2. **백엔드**: `/api/v1/graph/edges`가 **관계 1건씩 그대로 반환** (집계 없음)
  3. **프론트엔드**: 같은 `from→to` 쌍을 묶어 **ratio를 합산(sum)** → 100% 초과

#### 해결 방안

**백엔드 수정** (`backend/app/api/v1/endpoints/graph.py`):
- **(from,to) 단위로 집계**하도록 Cypher 쿼리 변경
- `ratio = max(r.stockRatio)` (최대 지분율 사용)
- `count = count(r)` (관계 건수 집계)
- 응답에 `count` 필드 추가

**프론트엔드 수정** (`frontend/graph.js`):
- **sum 제거**, `max(ratio)` 사용
- `relCount` 합산 (백엔드 `count` 필드 활용)
- ratio를 **0~100 범위로 clamp** (`Math.max(0, Math.min(100, maxRatio))`)
- 라벨: `maxRatio% (relCount건)` 형식 (건수가 1건 초과일 때만 표시)

#### 기술적 상세

**변경 전 (백엔드)**:
```cypher
MATCH (s:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
WHERE ...
RETURN id(s) AS fromId, id(c) AS toId, r.stockRatio AS ratio
```

**변경 후 (백엔드)**:
```cypher
MATCH (s:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
WHERE ...
WITH id(s) AS fromId, id(c) AS toId, max(r.stockRatio) AS ratio, count(r) AS relCount
WHERE ($min_ratio IS NULL OR ratio >= $min_ratio)
RETURN fromId, toId, ratio, relCount
ORDER BY ratio DESC
LIMIT $limit
```

**변경 전 (프론트엔드)**:
```javascript
const ratio = edges.reduce((sum, ed) => sum + (ed.ratio || 0), 0); // ❌ 합산
label: `${ratio.toFixed(1)}% (${edges.length}건)`
```

**변경 후 (프론트엔드)**:
```javascript
const maxRatio = Math.max(...edges.map(ed => Number(ed.ratio || 0))); // ✅ 최대값
const relCount = edges.reduce((sum, ed) => sum + Number(ed.count || 1), 0);
const ratio = Math.max(0, Math.min(100, maxRatio)); // ✅ 0~100 clamp
label: relCount > 1 ? `${ratio.toFixed(1)}% (${relCount}건)` : `${ratio.toFixed(1)}%`
```

---

### 🔴 P0-2: AI 질문 에러코드 이슈 - Context Length 초과 (400)

#### 문제 분석
- **증상**: AI 질문 시 `Error code: 400 - This model's maximum context length is 128000 tokens. However, your messages resulted in 159406 tokens.`
- **근본 원인**:
  1. `Neo4jGraph(enhanced_schema=True)` 설정으로 **스키마 토큰이 과도하게 증가**
  2. `GraphCypherQAChain` 프롬프트에 `{schema}`가 그대로 포함되어 LLM 호출 시 컨텍스트 초과
  3. 대화 이력이 누적되면서 토큰 수 증가

#### 해결 방안

**백엔드 수정** (`backend/app/services/graph_service.py`):
- `enhanced_schema=False`로 변경
- 도메인 규칙은 프롬프트(`CYPHER_PROMPT`)에 이미 명시되어 있어 품질 저하 최소화
- 스키마 토큰 대폭 축소 (약 70% 감소 예상)

**프론트엔드 추가** (`frontend/graph.js`, `frontend/graph.html`):
- **"대화 초기화" 버튼** 추가 (컨텍스트 초과 에러 해결을 위한 명확한 UX)
- `DELETE /api/v1/chat` API 호출
- 채팅 메시지 영역 초기화
- 사용자 피드백 (확인 다이얼로그 + 상태 메시지)

#### 기술적 상세

**변경 전**:
```python
_graph = Neo4jGraph(
    url=s.NEO4J_URI,
    username=s.NEO4J_USER,
    password=s.NEO4J_PASSWORD,
    enhanced_schema=True,  # ❌ 스키마 토큰 급증
)
```

**변경 후**:
```python
_graph = Neo4jGraph(
    url=s.NEO4J_URI,
    username=s.NEO4J_USER,
    password=s.NEO4J_PASSWORD,
    enhanced_schema=False,  # ✅ 스키마 토큰 축소 (도메인 규칙은 프롬프트에 명시)
)
```

**프론트엔드 추가**:
```javascript
// 대화 초기화 함수
async function resetChatHistory() {
  await apiCall('/api/v1/chat', { method: 'DELETE' });
  // 채팅 메시지 영역 초기화
  // 컨텍스트 초기화
  // 사용자 피드백
}
```

---

## UX 개선 사항

### 1. 엣지 라벨 개선
- **변경 전**: `662.2% (11건)` (항상 건수 표시)
- **변경 후**: 
  - 1건: `662.2%` (건수 생략)
  - 2건 이상: `662.2% (11건)` (건수 표시)
- **효과**: 불필요한 정보 제거, 가독성 향상

### 2. 대화 초기화 버튼 추가
- **위치**: 채팅 입력 영역 하단
- **스타일**: 덜 눈에 띄게 (연한 회색, 작은 크기)
- **기능**: 
  - 확인 다이얼로그로 실수 방지
  - 백엔드 대화 이력 초기화
  - 프론트엔드 UI 초기화
  - 사용자 피드백

---

## 테스트 체크리스트

### DB값 표출 이슈
- [ ] 엣지 라벨이 100%를 초과하지 않는지
- [ ] 관계 건수가 정확히 표시되는지
- [ ] 1건일 때 건수 표시가 생략되는지
- [ ] 여러 리포트/기준일로 인한 중복 관계가 올바르게 집계되는지

### AI 질문 에러코드 이슈
- [ ] 컨텍스트 초과 에러가 발생하지 않는지
- [ ] 대화 초기화 버튼이 정상 동작하는지
- [ ] 초기화 후 새로운 질문이 정상 작동하는지
- [ ] 확인 다이얼로그가 표시되는지

---

## 예상 효과

### 성능 개선
- **스키마 토큰 감소**: 약 70% 감소 예상
- **LLM 호출 성공률**: 컨텍스트 초과 에러 대폭 감소

### 사용자 경험 개선
- **데이터 신뢰성**: 지분율이 항상 0~100% 범위 내 표시
- **에러 복구**: 대화 초기화 버튼으로 컨텍스트 초과 시 즉시 해결 가능
- **가독성**: 불필요한 정보 제거로 엣지 라벨 명확화

---

## 참고 자료

- **백엔드 코드**: `backend/app/api/v1/endpoints/graph.py` (243-291줄)
- **백엔드 코드**: `backend/app/services/graph_service.py` (22-33줄)
- **프론트엔드 코드**: `frontend/graph.js` (1058-1075줄, 1455-1490줄)
- **프론트엔드 UI**: `frontend/graph.html` (183-191줄)
- **프론트엔드 스타일**: `frontend/graph.css` (566-610줄)

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-02-17
