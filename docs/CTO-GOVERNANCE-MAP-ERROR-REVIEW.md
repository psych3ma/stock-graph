# CTO Review: 지배구조 맵 보기 및 에러 메시지 UX 개선

**검토자**: 디자이너 및 백엔드 출신 CTO  
**작업 일자**: 2026-02-19  
**검토 기준**: 호환성, 일관성, 유지보수성, 확장성, 협업 코드

---

## 📋 목차

1. [개요](#개요)
2. [현재 상태 분석](#현재-상태-분석)
3. [이슈 1: 그래프 섹션 - 백엔드 연결 실패](#이슈-1-그래프-섹션---백엔드-연결-실패)
4. [이슈 2: 헤더 섹션 - 안내 문구 길이](#이슈-2-헤더-섹션---안내-문구-길이)
5. [이슈 3: 지배구조 맵 보기 기능](#이슈-3-지배구조-맵-보기-기능)
6. [개선 방안](#개선-방안)
7. [구현 계획](#구현-계획)

---

## 개요

### 검토 대상

1. **그래프 섹션**: 백엔드 서버 연결 실패 시 표시되는 에러 메시지
2. **헤더 섹션**: "그래프 컨테이너를 찾을 수 없습니다 - 페이지를 새로고침해주세요" 안내 문구
3. **지배구조 맵 보기**: 노드 선택 시 표시되는 "이 노드 기준 지배구조 맵 보기" 기능

### 검토 관점

- **디자이너 관점**: 사용자 경험, 메시지 간결성, 시각적 일관성
- **백엔드 CTO 관점**: 에러 처리 로직, API 안정성, 재시도 메커니즘

---

## 현재 상태 분석

### 1. 그래프 섹션 - 백엔드 연결 실패

**현재 구현** (`frontend/graph.js:783-812`):
```javascript
function showConnectionError(err) {
  const graphArea = document.getElementById("graphArea");
  if (!graphArea) return;
  const tryUrl = API_BASE + "/ping";
  graphArea.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:var(--text-2);max-width:520px;margin:0 auto;">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <h2 style="font-size:18px;font-weight:600;color:var(--text-1);margin-bottom:8px;">Backend 서버 연결 실패</h2>
      <p style="font-size:13px;line-height:1.6;margin-bottom:20px;">
        연결 시도 주소: <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px;font-size:12px;">${tryUrl}</code>
      </p>
      <div style="text-align:left;background:var(--surface-2);padding:16px 20px;border-radius:var(--r);border:1px solid var(--border);margin-bottom:20px;">
        <p style="font-size:12px;font-weight:600;color:var(--text-1);margin-bottom:10px;">해결 순서 (터미널에서):</p>
        <p style="font-size:12px;margin:6px 0;"><b>1.</b> 포트 정리 (이전에 실행한 Backend가 있으면) &rarr; <code style="background:var(--surface);padding:2px 6px;">make stop-be</code></p>
        <p style="font-size:12px;margin:6px 0;"><b>2.</b> Backend 실행 (새 터미널 탭/창에서) &rarr; <code style="background:var(--surface);padding:2px 6px;">make run-be</code></p>
        <p style="font-size:12px;margin:6px 0;"><b>3.</b> 이 페이지에서 <strong>다시 시도</strong> 또는 새로고침</p>
      </div>
      <p style="font-size:11px;color:var(--text-3);margin-bottom:8px;">
        진단: <code style="background:var(--surface-2);padding:2px 4px;">make check-be</code> &nbsp;|&nbsp;
        수동 확인: <code style="background:var(--surface-2);padding:2px 4px;">curl ${tryUrl}</code>
      </p>
      <p style="font-size:11px;color:var(--text-3);margin-bottom:20px;">
        파일로 열었다면: <code style="background:var(--surface-2);padding:2px 4px;">make serve-graph</code> 실행 후 <code style="background:var(--surface-2);padding:2px 4px;">http://localhost:8080/graph.html</code> 접속
      </p>
      <button onclick="location.reload()" style="margin-top:8px;padding:10px 20px;background:var(--pwc-orange);color:#fff;border:none;border-radius:var(--r);cursor:pointer;font-weight:500;">
        다시 시도
      </button>
    </div>
  `;
}
```

**문제점**:
- ✅ **정보 제공**: 상세한 해결 방법 제공 (개발자 친화적)
- ⚠️ **메시지 길이**: 너무 길어서 일반 사용자에게 부담
- ⚠️ **기술적 용어**: `make`, `curl`, `localhost:8000` 등 개발자 용어 다수
- ⚠️ **인라인 스타일**: CSS 분리 필요 (유지보수성)

### 2. 헤더 섹션 - 안내 문구 길이

**현재 구현** (`frontend/graph.js:1658-1661`):
```javascript
updateStatus(
  "그래프 컨테이너를 찾을 수 없습니다 - 페이지를 새로고침해주세요",
  false,
);
```

**표시 위치** (`frontend/graph.html`):
```html
<!-- statusText가 헤더에 표시되는 것으로 추정 -->
```

**문제점**:
- ⚠️ **메시지 길이**: 30자 이상으로 헤더 공간을 과도하게 차지
- ⚠️ **가독성**: 긴 메시지로 인한 시각적 혼란
- ⚠️ **일관성**: 다른 상태 메시지와 길이 불일치

### 3. 지배구조 맵 보기 기능

**현재 구현** (`frontend/graph.js:407-464`):
```javascript
async function loadEgoGraph(nodeId) {
  try {
    isEgoMode = true;
    egoCenterId = nodeId;
    showGraphLoading(
      LOADING_MESSAGES.loadingEgo,
      LOADING_GUIDANCE.loadingEgo,
      null,
      0,
    );
    const res = await apiCall(
      `/api/v1/graph/ego?node_id=${encodeURIComponent(nodeId)}&max_hops=2&max_nodes=120`,
    );
    // ... 처리 로직
  } catch (e) {
    // 에러 처리
    if (e.message && e.message.includes("404")) {
      alert("해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.");
    } else {
      showConnectionError(e);
    }
  }
}
```

**백엔드 API** (`backend/app/api/v1/endpoints/graph.py:540-661`):
```python
@router.get("/ego")
def get_ego_graph(
    node_id: str = Query(..., description="중심 노드 ID"),
    max_hops: int = Query(2, ge=1, le=3, description="최대 홉 수"),
    max_nodes: int = Query(120, ge=10, le=500, description="최대 노드 수"),
):
    # Neo4j 쿼리 실행
    # ...
```

**문제점**:
- ✅ **기능 구현**: 정상 작동
- ⚠️ **에러 처리**: 백엔드 연결 실패 시 `showConnectionError()` 호출로 인한 중복 메시지
- ⚠️ **사용자 피드백**: `alert()` 사용 (UX 일관성 부족)

---

## 이슈 1: 그래프 섹션 - 백엔드 연결 실패

### 디자이너 관점

**현재 문제**:
1. **메시지 길이**: 너무 상세한 기술적 정보로 인한 사용자 부담
2. **시각적 계층**: 중요 정보와 부가 정보 구분 부족
3. **액션 버튼**: "다시 시도" 버튼만 제공 (자동 재시도 없음)

**개선 방향**:
- **간결한 메시지**: 핵심 메시지만 표시
- **접을 수 있는 상세 정보**: 개발자용 정보는 접기/펼치기로 제공
- **자동 재시도**: 일정 간격으로 자동 재연결 시도
- **진행 상태 표시**: 재시도 중 상태 표시

### 백엔드 CTO 관점

**현재 문제**:
1. **에러 감지**: `/ping` 엔드포인트만 확인 (실제 API 상태 미확인)
2. **재시도 로직**: 수동 재시도만 가능 (자동 재시도 없음)
3. **에러 분류**: 네트워크 에러와 서버 에러 구분 부족

**개선 방향**:
- **Health Check 강화**: `/ping` 외에 `/api/v1/health` 엔드포인트 추가
- **자동 재시도**: 지수 백오프를 사용한 자동 재연결
- **에러 분류**: 네트워크 에러, 서버 에러, 타임아웃 등 구분
- **로깅**: 에러 발생 시 상세 로그 기록

---

## 이슈 2: 헤더 섹션 - 안내 문구 길이

### 디자이너 관점

**현재 문제**:
- 메시지가 너무 길어 헤더 공간을 과도하게 차지
- 다른 상태 메시지와 일관성 부족

**개선 방향**:
- **간결한 메시지**: 핵심만 표시 (예: "컨테이너 오류")
- **툴팁 활용**: 상세 정보는 툴팁으로 제공
- **아이콘 활용**: 시각적 표시로 메시지 길이 단축

### 백엔드 CTO 관점

**현재 문제**:
- 프론트엔드 초기화 실패와 백엔드 연결 실패가 혼재
- 에러 원인 구분 부족

**개선 방향**:
- **에러 타입 구분**: 컨테이너 오류 vs 백엔드 연결 오류
- **에러 코드**: 각 에러 타입에 대한 코드 부여
- **자동 복구**: 일부 에러는 자동으로 재시도

---

## 이슈 3: 지배구조 맵 보기 기능

### 디자이너 관점

**현재 문제**:
- `alert()` 사용으로 인한 UX 일관성 부족
- 로딩 상태 표시는 있으나 에러 상태 표시 부족

**개선 방향**:
- **인라인 에러 메시지**: `alert()` 대신 인라인 메시지 표시
- **에러 상태 표시**: 노드 상세 패널에 에러 상태 표시
- **재시도 버튼**: 에러 발생 시 재시도 버튼 제공

### 백엔드 CTO 관점

**현재 문제**:
- API 에러 처리: 404만 특별 처리, 다른 에러는 일반 에러 처리
- 타임아웃 처리: 명시적 타임아웃 설정 없음
- 캐싱: Ego 그래프 결과 캐싱 없음

**개선 방향**:
- **에러 분류**: 404, 500, 503 등 에러 타입별 처리
- **타임아웃 설정**: API 호출 타임아웃 명시적 설정
- **캐싱 전략**: 동일 노드에 대한 Ego 그래프 결과 캐싱
- **로깅**: Ego 그래프 요청/응답 로깅

---

## 개선 방안

### 1. 그래프 섹션 에러 메시지 개선

#### 디자이너 관점 개선안

**간결한 메시지 + 접을 수 있는 상세 정보**:
```javascript
function showConnectionError(err) {
  const graphArea = document.getElementById("graphArea");
  if (!graphArea) return;
  const tryUrl = API_BASE + "/ping";
  
  graphArea.innerHTML = `
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <h2 class="error-title">서버에 연결할 수 없습니다</h2>
      <p class="error-message">백엔드 서버가 실행 중인지 확인해주세요.</p>
      
      <!-- 간단한 액션 -->
      <div class="error-actions">
        <button class="btn-primary" onclick="retryConnection()">다시 시도</button>
        <button class="btn-secondary" onclick="toggleErrorDetails()">상세 정보</button>
      </div>
      
      <!-- 접을 수 있는 상세 정보 -->
      <div class="error-details hidden" id="errorDetails">
        <div class="error-details-content">
          <p><strong>연결 주소:</strong> <code>${tryUrl}</code></p>
          <p><strong>해결 방법:</strong></p>
          <ol>
            <li>터미널에서 <code>make stop-be</code> 실행</li>
            <li>새 터미널에서 <code>make run-be</code> 실행</li>
            <li>이 페이지에서 다시 시도</li>
          </ol>
        </div>
      </div>
    </div>
  `;
}
```

**자동 재시도 기능**:
```javascript
let retryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3초

function retryConnection() {
  retryCount++;
  if (retryCount > MAX_RETRIES) {
    showConnectionError(new Error("최대 재시도 횟수 초과"));
    return;
  }
  
  // 재시도 중 상태 표시
  showRetryingState();
  
  setTimeout(async () => {
    try {
      await apiCall("/ping");
      location.reload(); // 성공 시 페이지 새로고침
    } catch (e) {
      retryConnection(); // 실패 시 재시도
    }
  }, RETRY_DELAY);
}

function showRetryingState() {
  const graphArea = document.getElementById("graphArea");
  graphArea.innerHTML = `
    <div class="retrying-container">
      <div class="spinner"></div>
      <p>연결 재시도 중... (${retryCount}/${MAX_RETRIES})</p>
    </div>
  `;
}
```

#### 백엔드 CTO 관점 개선안

**Health Check 엔드포인트 추가**:
```python
# backend/app/api/v1/endpoints/system.py
@router.get("/health")
def health_check():
    """상세한 헬스 체크 (Neo4j 연결 상태 포함)"""
    try:
        graph = graph_service.get_graph()
        graph.query("RETURN 1 AS test LIMIT 1")
        return {
            "status": "healthy",
            "backend": "ok",
            "neo4j": "connected",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "backend": "ok",
            "neo4j": "disconnected",
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
        }
```

**에러 분류 및 로깅**:
```javascript
function classifyError(err) {
  if (!err) return "UNKNOWN";
  
  const message = err.message || "";
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "NETWORK_ERROR";
  }
  if (message.includes("timeout")) {
    return "TIMEOUT";
  }
  if (message.includes("503")) {
    return "SERVICE_UNAVAILABLE";
  }
  if (message.includes("500")) {
    return "SERVER_ERROR";
  }
  return "UNKNOWN";
}

function showConnectionError(err) {
  const errorType = classifyError(err);
  const errorMessages = {
    NETWORK_ERROR: "네트워크 연결을 확인해주세요",
    TIMEOUT: "서버 응답 시간이 초과되었습니다",
    SERVICE_UNAVAILABLE: "서비스가 일시적으로 사용할 수 없습니다",
    SERVER_ERROR: "서버 오류가 발생했습니다",
    UNKNOWN: "연결에 실패했습니다",
  };
  
  // 로깅
  console.error("Connection error:", {
    type: errorType,
    message: err.message,
    timestamp: new Date().toISOString(),
  });
  
  // 사용자 메시지 표시
  // ...
}
```

### 2. 헤더 안내 문구 개선

#### 디자이너 관점 개선안

**간결한 메시지 + 툴팁**:
```javascript
function updateStatus(text, ok) {
  const el = document.getElementById("statusText");
  const dot = document.getElementById("statusDot");
  
  if (el) {
    // 긴 메시지는 축약
    const shortText = text.length > 20 
      ? text.substring(0, 17) + "..." 
      : text;
    el.textContent = shortText;
    el.title = text; // 전체 메시지는 툴팁으로
  }
  
  if (dot) {
    dot.className = ok ? "sdot" : "sdot error";
  }
}

// 사용 예시
updateStatus(
  "컨테이너 오류",
  false,
);
// 툴팁: "그래프 컨테이너를 찾을 수 없습니다 - 페이지를 새로고침해주세요"
```

**아이콘 활용**:
```html
<!-- 헤더에 상태 아이콘 추가 -->
<div class="status-indicator">
  <span class="status-icon" id="statusIcon">⚠️</span>
  <span class="status-text" id="statusText">컨테이너 오류</span>
</div>
```

#### 백엔드 CTO 관점 개선안

**에러 코드 시스템**:
```javascript
const ERROR_CODES = {
  CONTAINER_NOT_FOUND: "CONTAINER_001",
  BACKEND_CONNECTION_FAILED: "BACKEND_001",
  NEO4J_CONNECTION_FAILED: "NEO4J_001",
};

function updateStatus(text, ok, errorCode = null) {
  const el = document.getElementById("statusText");
  if (el) {
    el.textContent = text;
    el.dataset.errorCode = errorCode || "";
  }
  
  // 에러 코드별 자동 복구 시도
  if (!ok && errorCode === ERROR_CODES.BACKEND_CONNECTION_FAILED) {
    setTimeout(() => retryConnection(), 5000); // 5초 후 자동 재시도
  }
}
```

### 3. 지배구조 맵 보기 기능 개선

#### 디자이너 관점 개선안

**인라인 에러 메시지**:
```javascript
async function loadEgoGraph(nodeId) {
  try {
    // ... 기존 로직
  } catch (e) {
    isEgoMode = false;
    egoCenterId = null;
    
    // alert() 대신 인라인 메시지 표시
    const nodeDetail = document.getElementById("nodeDetail");
    if (nodeDetail) {
      nodeDetail.innerHTML = `
        <div class="error-message-inline">
          <div class="error-icon-small">⚠️</div>
          <div class="error-content">
            <p class="error-title">지배구조 맵을 불러올 수 없습니다</p>
            <p class="error-detail">${e.message || "알 수 없는 오류가 발생했습니다"}</p>
            <button class="btn-retry" onclick="loadEgoGraph('${nodeId}')">다시 시도</button>
          </div>
        </div>
      `;
    }
  }
}
```

#### 백엔드 CTO 관점 개선안

**에러 분류 및 캐싱**:
```python
# backend/app/api/v1/endpoints/graph.py
@router.get("/ego")
def get_ego_graph(
    node_id: str = Query(..., description="중심 노드 ID"),
    max_hops: int = Query(2, ge=1, le=3, description="최대 홉 수"),
    max_nodes: int = Query(120, ge=10, le=500, description="최대 노드 수"),
):
    try:
        # 캐싱 확인 (선택적)
        # cache_key = f"ego:{node_id}:{max_hops}:{max_nodes}"
        # cached = cache.get(cache_key)
        # if cached:
        #     return cached
        
        # Neo4j 쿼리 실행
        # ...
        
    except NotFoundError:
        raise HTTPException(404, "노드를 찾을 수 없습니다")
    except TimeoutError:
        raise HTTPException(504, "요청 시간이 초과되었습니다")
    except Exception as e:
        logger.error(f"Ego graph error: {str(e)}", exc_info=True)
        raise HTTPException(500, "지배구조 맵을 불러오는 중 오류가 발생했습니다")
```

**프론트엔드 타임아웃 설정**:
```javascript
async function loadEgoGraph(nodeId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃
  
  try {
    const res = await apiCall(
      `/api/v1/graph/ego?node_id=${encodeURIComponent(nodeId)}&max_hops=2&max_nodes=120`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    // ... 처리 로직
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      // 타임아웃 에러 처리
      showError("요청 시간이 초과되었습니다. 다시 시도해주세요.");
    } else {
      // 기타 에러 처리
      handleEgoGraphError(e, nodeId);
    }
  }
}
```

---

## 구현 계획

### 단계 1: 즉시 개선 (P0)

1. **헤더 메시지 간소화**
   - 메시지 길이 20자 이하로 제한
   - 툴팁으로 전체 메시지 표시
   - 예상 시간: 1시간

2. **에러 메시지 CSS 분리**
   - 인라인 스타일을 CSS 클래스로 이동
   - 예상 시간: 1시간

### 단계 2: 단기 개선 (P1)

3. **자동 재시도 기능**
   - 백엔드 연결 실패 시 자동 재시도 (최대 3회)
   - 재시도 중 상태 표시
   - 예상 시간: 2-3시간

4. **에러 분류 시스템**
   - 에러 타입별 메시지 및 처리 로직
   - 예상 시간: 2시간

5. **Health Check 엔드포인트**
   - `/api/v1/health` 엔드포인트 추가
   - Neo4j 연결 상태 포함
   - 예상 시간: 1-2시간

### 단계 3: 중기 개선 (P2)

6. **지배구조 맵 에러 처리 개선**
   - `alert()` 제거 및 인라인 메시지로 변경
   - 타임아웃 설정 및 에러 분류
   - 예상 시간: 2-3시간

7. **캐싱 전략**
   - Ego 그래프 결과 캐싱 (선택적)
   - 예상 시간: 2-3시간

8. **로깅 강화**
   - 에러 발생 시 상세 로그 기록
   - 예상 시간: 1-2시간

---

## 결론

### 현재 상태 요약

**강점**:
- ✅ 상세한 에러 정보 제공 (개발자 친화적)
- ✅ 지배구조 맵 기능 정상 작동
- ✅ 명확한 해결 방법 제시

**개선 필요 영역**:
- ⚠️ 메시지 길이: 일반 사용자에게 부담
- ⚠️ 에러 처리: 자동 재시도 및 에러 분류 부족
- ⚠️ UX 일관성: `alert()` 사용 및 인라인 스타일

### 권장 사항

1. **즉시 개선**: 헤더 메시지 간소화, CSS 분리
2. **단기 개선**: 자동 재시도, 에러 분류, Health Check
3. **중기 개선**: 지배구조 맵 에러 처리, 캐싱, 로깅

---

## 관련 파일

### 프론트엔드
- `frontend/graph.js`: 에러 처리 로직 (라인 783-844, 1658-1661)
- `frontend/graph.html`: 헤더 구조
- `frontend/graph.css`: 에러 메시지 스타일 (추가 필요)

### 백엔드
- `backend/app/api/v1/endpoints/graph.py`: Ego 그래프 API (라인 540-661)
- `backend/app/api/v1/endpoints/system.py`: Health Check 엔드포인트 (추가 필요)

### 문서
- `docs/CTO-GOVERNANCE-MAP-ERROR-REVIEW.md`: 본 문서
