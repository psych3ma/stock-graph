# GraphIQ 그래프 시각화 UI

고급 그래프 시각화 UI가 추가되었습니다. Neo4j 데이터를 인터랙티브하게 탐색할 수 있습니다.

## 실행 방법

### 1. Backend 실행
```bash
make run-be
# 또는
cd backend && PYTHONPATH=. uvicorn app.main:api --reload --host 0.0.0.0 --port 8000
```

### 2. HTML 파일 열기
브라우저에서 `frontend/graph.html` 파일을 직접 열거나, 간단한 HTTP 서버로 실행:

```bash
# Python 3
cd frontend && python3 -m http.server 8080

# 또는 Node.js
cd frontend && npx http-server -p 8080
```

그 후 브라우저에서 `http://localhost:8080/graph.html` 접속

## 주요 기능

### 그래프 시각화
- **노드 타입**: 회사(Company), 개인주주(Person), 최대주주(Major), 기관(Institution)
- **인터랙션**: 드래그로 노드 이동, 줌 인/아웃, 패닝
- **필터링**: 상단 필터로 노드 타입별 표시/숨김
- **검색**: 회사명/주주명으로 노드 검색

### 노드 상세 패널
- 노드 클릭 시 상세 정보 표시
- 연결된 노드 목록
- 속성 정보
- AI 질문 버튼

### AI 채팅
- 노드 컨텍스트 기반 질문
- 실제 Neo4j + LLM 연동
- 답변 출처 표시 (DB / DB_EMPTY / LLM)

## API 엔드포인트

### `GET /api/v1/graph/nodes`
그래프 노드 목록 조회

**Query Parameters:**
- `limit` (int, 기본 50): 최대 노드 수
- `node_type` (str, 선택): 필터 (company, person, major, institution)
- `search` (str, 선택): 검색어

**Response:**
```json
{
  "nodes": [
    {
      "id": "c123",
      "type": "company",
      "label": "삼성전자(주)",
      "bizno": "1234567890",
      "active": true,
      "sub": "회사"
    }
  ],
  "total": 50
}
```

### `GET /api/v1/graph/edges`
그래프 엣지(관계) 목록 조회

**Query Parameters:**
- `limit` (int, 기본 100): 최대 엣지 수
- `node_ids` (str, 선택): 특정 노드 ID들 (쉼표 구분)

**Response:**
```json
{
  "edges": [
    {
      "from": "p456",
      "to": "c123",
      "type": "HOLDS_SHARES",
      "ratio": 62.3,
      "label": "62.3%"
    }
  ],
  "total": 100
}
```

### `GET /api/v1/graph/nodes/{node_id}`
특정 노드의 상세 정보

**Response:**
```json
{
  "id": "c123",
  "type": "company",
  "label": "삼성전자(주)",
  "sub": "회사",
  "stats": [
    {"val": "62.3%", "key": "최대주주 지분율"},
    {"val": "8", "key": "주주 수"}
  ],
  "props": {
    "bizno": "1234567890",
    "isActive": true
  },
  "related": [
    {
      "id": "p456",
      "label": "김○○",
      "type": "person",
      "ratio": 62.3
    }
  ]
}
```

## 성능 고려사항

- 초기 로드는 **50개 노드, 100개 엣지**로 제한
- 노드 클릭 시 해당 노드의 연결만 추가 로드 (Lazy Loading)
- 필터링은 클라이언트 사이드에서 처리 (서버 부하 감소)

## 향후 개선

- [ ] 서버 사이드 필터링 (대용량 데이터)
- [ ] WebSocket 실시간 업데이트
- [ ] 그래프 레이아웃 알고리즘 (Force-directed, Hierarchical)
- [ ] 엣지 타입별 색상/스타일
- [ ] 그래프 내보내기 (PNG/SVG)
