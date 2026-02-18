/* ═══════════════════════════════════════════════════════════════════════════
   FILE STRUCTURE (협업용)
   1) CONFIG  - API_BASE, GRAPH_CONFIG, LAYOUT_CONFIG, NODE_COLORS, NODE_RADIUS
   2) STATE   - NODES, EDGES, positions, selectedNode, isEgoMode, ...
   3) API     - apiCall, loadGraph, loadEgoGraph, loadNodeDetail
   4) LAYOUT  - computeHierarchicalLayout, initPositions
   5) RENDER  - renderGraph, 노드/엣지 SVG 생성
   6) PANEL   - selectNode, renderNodeDetail, showEmptyPanel
   7) CHAT    - sendChatMessage, openChatWithContext, 메시지 렌더
   8) INIT    - 이벤트 바인딩, loadGraph() 호출
══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════ */
// file:// 로 열면 hostname이 비어 있어 연결 실패하므로, 로컬은 항상 localhost:8000 사용
const API_BASE = window.GRAPHIQ_API_BASE || (
  (!window.location.hostname || window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`
);

// 그래프 API limit·노드 타입 일관성 (확장 시 이곳만 수정)
const GRAPH_CONFIG = {
  limits: { nodes: 500, edges: 200, nodesFallback: 50 },
  nodeTypes: ['company', 'person', 'major', 'institution'],
  minRatio: 5, // 초기 로딩 시 N% 미만 지분 관계 제외 (Cypher 가지치기, 노이즈·뭉침 감소)
};

// Force Simulation (공간 효율성: Bounding Box 명시, 척력 강화, Link 거리 확대, Component Packing)
const LAYOUT_CONFIG = {
  force: {
    gravity: 0,                 // >0 이면 F∝distance² 적용 (중앙 근처는 미미, 멀수록 증가 → 뭉침 억제)
    minDist: 320,              // 반발 기준 거리 확대
    repulsionRange: 4.0,
    repulsionStrength: 160,     // 5배 강화: 노드가 서로 강하게 밀어남
    collisionRadiusMultiplier: 2.5,
    layoutRadiusMultiplier: 3,  // 레이아웃 시 '물리적 크기' = 원 반지름 × N (라벨·화살표 겹침 방지)
    idealDistMin: 360,          // 링크 목표 길이 2배 (구조가 펴짐)
    idealDistMax: 800,
    idealDistDegreeFactor: 0.2, // 차수 기반 가변 거리: idealDist *= 1 + (deg1+deg2)*this (허브 분산)
    useInverseSqrtEdgeLength: true, // true: L∝1/√지분 (주요 지배 가깝게, 소액 멀리), false: 선형
    idealDistBaseLengthForInverseSqrt: 2000,   // 역제곱근 모드 시 L = baseLength/√ratio, idealMin/Max로 clamp
    repulsionDegreeFactor: 0.5, // 차수 기반 반발력: BASE * (1 + degree*this) → 슈퍼노드 주변 공간 확보
    edgeForce: 0.05,
    maxIter: 1000,
    padding: 100,
    useFullArea: true,
    damping: 0.78,              // 감쇠 — 튕겨 나가는 것 완화
    packComponents: true,       // Disconnected components 그리드 분산 배치
  },
  ego: { padding: 70, minNodeSpacing: 58, subRowHeight: 46 },
};

// 노드 색상 정의: active/closed 상태별 색상
const NODE_COLORS = {
  company:     { active: '#d85604', closed: '#999999' }, // 주황 / 회색
  person:      { active: '#ad1b02', closed: '#666666' }, // 빨강 / 어두운 회색
  major:       { active: '#e88d14', closed: '#888888' }, // 호박색 / 회색
  institution: { active: '#7c5cfc', closed: '#777777' }, // 보라 / 회색
};

// 노드 색상 가져오기 헬퍼 함수
function getNodeColor(node) {
  const typeColors = NODE_COLORS[node.type] || { active: '#999999', closed: '#666666' };
  // active가 false이거나 undefined이면 closed 색상 사용
  const isActive = node.active !== false; // 기본값은 true (active)
  return isActive ? typeColors.active : typeColors.closed;
}
const NODE_RADIUS = { company:22, person:16, major:20, institution:18 };

/** 레이아웃용 반지름: 원 + 라벨 박스(가로·세로)까지 포함한 '물리적 크기'. 충돌/반발/분리·fitToView에만 사용.
 *  node 인자 있으면 라벨 길이·세로(아래) 반영; label 없으면 name 등 표시용 필드 폴백. */
function getLayoutRadius(nodeOrType) {
  const type = typeof nodeOrType === 'object' ? nodeOrType?.type : nodeOrType;
  const base = NODE_RADIUS[type] || 18;
  const mult = LAYOUT_CONFIG.force.layoutRadiusMultiplier ?? 3;
  const lc = LABEL_CONFIG;
  const labelHeight = 16;
  const verticalExtent = base + (lc.labelGap || 18) + labelHeight; // 원 아래 라벨까지 세로 반경

  if (typeof nodeOrType === 'object') {
    const labelText = (nodeOrType.label ?? nodeOrType.name ?? '').toString();
    const labelHalf = (labelText.length * (lc.pxPerChar || 8)) * 0.5;
    const horizontalRadius = Math.max(base, base + labelHalf);
    const withLabel = Math.max(horizontalRadius, verticalExtent);
    return Math.max(base * mult, withLabel);
  }
  return Math.max(base * mult, verticalExtent);
}

// 노드 라벨: 노드 외부(하단) 전용, 겹침 회피 파라미터
const LABEL_CONFIG = {
  maxLength: 28,           // 비선택 시 표시 최대 글자 수 (말줄임)
  maxLengthSelected: 36,   // 선택 시
  pxPerChar: 8,            // 한글 등 폭 추정 (px/자)
  labelGap: 18,            // 노드 가장자리 ~ 라벨 세로 간격
  minLabelSpacingY: 6,     // 라벨 간 최소 세로 간격
  minLabelSpacingX: 4,     // 라벨 간 최소 가로 간격 (겹치면 가로 시프트)
  fontSize: 11,
  fontSizeSelected: 13,
};

/** CSS 변수에서 색상 읽기 (테마 일관성, 하드코딩 제거) */
function getThemeColor(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--' + name);
  if (v) return v.trim();
  const fallbacks = {
    'edge-stroke': '#8b7d6f',
    'pwc-orange': '#d85604',
    'surface-tint': '#fff4ed',
    'surface-overlay': 'rgba(249,247,245,.9)',
    'border-tint': '#fbc99a',
    'border': '#e8e2db',
    'text-3': '#a8998a',
  };
  return fallbacks[name] || '';
}

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let NODES = [];
let EDGES = [];
let positions = {};
let drag = null;
let pan  = {x:0, y:0, startX:0, startY:0, dragging:false};
let zoom = 1;
let selectedNode = null;
let activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
let nodeCounts = Object.fromEntries(GRAPH_CONFIG.nodeTypes.map(t => [t, 0])); // 노드 타입별 개수
let chatContext = null;
let nodeDetailCache = {};
let isEgoMode = false;
let egoCenterId = null;

/* ═══════════════════════════════════════════
   API
═══════════════════════════════════════════ */
async function apiCall(endpoint, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃
  
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
    }
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error('Backend 서버에 연결할 수 없습니다. Backend가 실행 중인지 확인하세요.');
    }
    console.error('API Error:', e);
    throw e;
  }
}

function exitEgoMode() {
  isEgoMode = false;
  egoCenterId = null;
  const banner = document.getElementById('egoBanner');
  if (banner) banner.classList.add('util-hidden');
  loadGraph();
}

async function loadEgoGraph(nodeId) {
  try {
    isEgoMode = true;
    egoCenterId = nodeId;
    showGraphLoading('지배구조 맵 로딩 중...', 'Ego-Graph 데이터를 가져옵니다');
    const res = await apiCall(`/api/v1/graph/ego?node_id=${encodeURIComponent(nodeId)}&max_hops=2&max_nodes=120`);
    if (!res || !res.nodes || !res.edges) {
      updateStatus('Ego 그래프 데이터 없음', false);
      hideGraphLoading();
      isEgoMode = false;
      return;
    }
    NODES = res.nodes;
    EDGES = res.edges;
    activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
    positions = {};
    computeHierarchicalLayout(res.ego_id);
    updateStatus('Neo4j 연결됨 (지배구조 맵)', true);
    hideGraphLoading();
    selectedNode = NODES.find(n => n.id === res.ego_id) || null;
    if (selectedNode) {
      const detail = await loadNodeDetail(selectedNode.id);
      if (detail) renderNodeDetail(detail);
      else renderNodeDetailFallback(selectedNode);
    }
    const banner = document.getElementById('egoBanner');
    if (banner) {
      banner.classList.remove('util-hidden');
      const btn = banner.querySelector('.ego-exit-btn');
      if (btn) btn.onclick = exitEgoMode;
    }
    renderGraph();
    fitToView();
  } catch (e) {
    isEgoMode = false;
    egoCenterId = null;
    const banner = document.getElementById('egoBanner');
    if (banner) banner.classList.add('util-hidden');
    updateStatus('Ego 그래프 로드 실패', false);
    hideGraphLoading();
    console.error('loadEgoGraph failed:', e);
    if (e.message && e.message.includes('404')) {
      alert('해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.');
    } else {
      showConnectionError(e);
    }
  }
}

async function loadGraph() {
  try {
    isEgoMode = false;
    egoCenterId = null;
    const banner = document.getElementById('egoBanner');
    if (banner) banner.classList.add('util-hidden');
    updateStatus('데이터 로딩 중...', false);
    showGraphLoading('연결 확인 중...', 'Backend 서버에 연결합니다');

    // 먼저 Backend 프로세스 라이브니스만 확인 (Neo4j 실패와 구분)
    try {
      await apiCall('/ping');
    } catch (e) {
      updateStatus('Backend 연결 실패 (포트 8000)', false);
      console.error('Backend ping failed:', e);
      hideGraphLoading();
      showConnectionError(e);
      return;
    }
    showGraphLoading('데이터 로딩 중...', '노드·관계 데이터를 가져옵니다');

    // 노드 개수 조회 및 필터 업데이트
    try {
      const countsRes = await apiCall('/api/v1/graph/node-counts');
      if (countsRes) {
        nodeCounts = countsRes;
        updateFilterCounts();
      }
    } catch (e) {
      console.warn('Failed to load node counts:', e);
      // 개수 조회 실패해도 계속 진행
    }
    
    // 엣지를 먼저 로드하여 연결된 노드 ID 수집
    let edgesRes;
    try {
      const minR = GRAPH_CONFIG.minRatio != null ? GRAPH_CONFIG.minRatio : '';
      edgesRes = await apiCall(`/api/v1/graph/edges?limit=${GRAPH_CONFIG.limits.edges}${minR !== '' ? `&min_ratio=${minR}` : ''}`);
    } catch (e) {
      updateStatus('데이터 로드 실패', false);
      console.error('Failed to load edges:', e);
      hideGraphLoading();
      if (e.message && e.message.includes('503')) showServiceUnavailable();
      else showConnectionError();
      return;
    }
    showGraphLoading('노드 로딩 중...', '연결된 노드 정보를 불러옵니다');

    // 빈 응답 처리 강화
    EDGES = (edgesRes?.edges || []).filter(e => e && e.from && e.to);
    
    // 엣지가 참조하는 모든 노드 ID 수집
    const requiredNodeIds = new Set();
    EDGES.forEach(e => {
      requiredNodeIds.add(e.from);
      requiredNodeIds.add(e.to);
    });
    
    // 연결된 노드만 조회 (엣지가 참조하는 노드들)
    let nodesRes;
    try {
      if (requiredNodeIds.size > 0) {
        // 노드 ID 목록을 쿼리 파라미터로 전달
        const nodeIdsParam = Array.from(requiredNodeIds).join(',');
        nodesRes = await apiCall(`/api/v1/graph/nodes?limit=${GRAPH_CONFIG.limits.nodes}&node_ids=${encodeURIComponent(nodeIdsParam)}`);
      } else {
        // 엣지가 없으면 기본 limit으로 노드만 로드
        nodesRes = await apiCall(`/api/v1/graph/nodes?limit=${GRAPH_CONFIG.limits.nodesFallback}`);
      }
    } catch (e) {
      updateStatus('노드 로드 실패', false);
      console.error('Failed to load nodes:', e);
      hideGraphLoading();
      if (e.message && e.message.includes('503')) showServiceUnavailable();
      else showConnectionError();
      return;
    }

    // 빈 응답 처리 강화
    NODES = (nodesRes?.nodes || []).filter(n => n && n.id);
    
    // 엣지가 참조하는 노드가 모두 로드되었는지 확인
    const loadedNodeIds = new Set(NODES.map(n => n.id));
    const missingNodeIds = new Set();
    EDGES.forEach(e => {
      if (!loadedNodeIds.has(e.from)) missingNodeIds.add(e.from);
      if (!loadedNodeIds.has(e.to)) missingNodeIds.add(e.to);
    });
    
    if (missingNodeIds.size > 0) {
      console.warn(`경고: ${missingNodeIds.size}개의 노드가 엣지에 참조되지만 로드되지 않았습니다.`);
      // 누락된 노드가 있으면 추가로 로드 시도
      try {
        const missingIdsParam = Array.from(missingNodeIds).slice(0, GRAPH_CONFIG.limits.nodes).join(',');
        const missingNodesRes = await apiCall(`/api/v1/graph/nodes?limit=${GRAPH_CONFIG.limits.nodes}&node_ids=${encodeURIComponent(missingIdsParam)}`);
        const missingNodes = (missingNodesRes?.nodes || []).filter(n => n && n.id);
        NODES.push(...missingNodes);
        console.log(`누락된 노드 ${missingNodes.length}개 추가 로드 완료`);
      } catch (e) {
        console.warn('누락된 노드 로드 실패:', e);
      }
    }
    
    // 엣지 필터링: 양쪽 노드가 모두 로드된 엣지만 유지
    const finalNodeIds = new Set(NODES.map(n => n.id));
    EDGES = EDGES.filter(e => finalNodeIds.has(e.from) && finalNodeIds.has(e.to));
    
    console.log(`그래프 로드 완료: 노드 ${NODES.length}개, 엣지 ${EDGES.length}개`);
    const typeCounts = {
      company: NODES.filter(n => n.type === 'company').length,
      person: NODES.filter(n => n.type === 'person').length,
      major: NODES.filter(n => n.type === 'major').length,
      institution: NODES.filter(n => n.type === 'institution').length,
    };
    console.log('노드 타입별 개수:', typeCounts);
    // node-counts API 실패/0건이면 로드된 NODES 기준으로 노드 유형 건수 표시
    const hasCounts = GRAPH_CONFIG.nodeTypes.some(t => (nodeCounts[t] || 0) > 0);
    if (!hasCounts && NODES.length > 0) {
      nodeCounts = { ...typeCounts };
      updateFilterCounts();
    }

    if (NODES.length === 0) {
      updateStatus('데이터 없음', false);
      hideGraphLoading();
      showEmptyState();
      return;
    }

    updateStatus('레이아웃 계산 중...', false);
    showGraphLoading('레이아웃 계산 중...', '노드 위치를 계산합니다 (잠시 걸릴 수 있습니다)');
    // SVG 크기가 0이면 격자처럼 뭉치므로, 레이아웃 한 프레임 대기 후 배치
    await new Promise(r => requestAnimationFrame(r));
    getGraphViewport(); // 컨테이너(#graphArea) 픽셀 크기를 SVG width/height에 명시 반영
    try {
      await initPositions(); // Promise로 변경되어 완료 대기
    } catch (e) {
      console.error('initPositions failed:', e);
      // 실패 시 격자/원형 폴백 없음: positions는 비우고 렌더 스킵 (CTO: 단일 경로 유지)
      positions = {};
    }
    
    updateStatus('렌더링 중...', false);
    showGraphLoading('렌더링 중...', '그래프를 그리는 중입니다');
    try {
      renderGraph();
      // 자동 fit-to-view: 모든 노드가 보이도록 줌/패닝 조정 (레이아웃 완료 후)
      fitToView();
      renderGraph(); // fitToView 후 다시 렌더링
      hideGraphLoading();
      updateStatus('Neo4j 연결됨', true);
    } catch (renderError) {
      console.error('Render failed:', renderError);
      hideGraphLoading();
      updateStatus('렌더링 실패', false);
      // 렌더링 실패해도 앱은 계속 작동하도록
    }
  } catch (e) {
    hideGraphLoading();
    updateStatus('연결 실패', false);
    console.error('Load graph failed:', e);
    showConnectionError();
  }
}

function showConnectionError(err) {
  const graphArea = document.getElementById('graphArea');
  if (!graphArea) return;
  const tryUrl = API_BASE + '/ping';
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

function showServiceUnavailable() {
  const graphArea = document.getElementById('graphArea');
  if (!graphArea) return;
  graphArea.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:var(--text-2);">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <h2 style="font-size:18px;font-weight:600;color:var(--text-1);margin-bottom:8px;">일시적으로 서비스를 사용할 수 없습니다</h2>
      <p style="font-size:14px;line-height:1.6;margin-bottom:20px;">
        Neo4j 또는 API 서버에 일시적 오류가 있을 수 있습니다.<br/>
        .env 의 NEO4J_URI, NEO4J_PASSWORD 를 확인하고 Backend 로그를 확인하세요.
      </p>
      <button onclick="location.reload()" style="margin-top:20px;padding:8px 16px;background:var(--pwc-orange);color:#fff;border:none;border-radius:var(--r);cursor:pointer;font-weight:500;">
        다시 시도
      </button>
    </div>
  `;
}

function showEmptyState() {
  const graphArea = document.getElementById('graphArea');
  graphArea.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:var(--text-2);">
      <div style="font-size:48px;margin-bottom:16px;">📊</div>
      <h2 style="font-size:18px;font-weight:600;color:var(--text-1);margin-bottom:8px;">데이터가 없습니다</h2>
      <p style="font-size:14px;line-height:1.6;">
        Neo4j 데이터베이스에 노드가 없거나<br/>
        필터 조건에 맞는 데이터가 없습니다.
      </p>
    </div>
  `;
}

async function loadNodeDetail(nodeId) {
  if (nodeDetailCache[nodeId]) return nodeDetailCache[nodeId];
  try {
    const data = await apiCall(`/api/v1/graph/nodes/${nodeId}`);
    nodeDetailCache[nodeId] = data;
    return data;
  } catch (e) {
    console.error('Load node detail failed:', e);
    return null;
  }
}

async function sendChatMessage(question) {
  const contextLabel = chatContext ? chatContext.label : null;
  const enhancedQ = contextLabel ? `"${contextLabel}"에 대해: ${question}` : question;
  
  try {
    const res = await apiCall('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({ question: enhancedQ }),
    });
    return res;
  } catch (e) {
    throw new Error('채팅 요청 실패');
  }
}

function updateStatus(text, ok) {
  const el = document.getElementById('statusText');
  if (el) el.textContent = text;
  const dot = document.getElementById('statusDot');
  if (dot) dot.className = ok ? 'sdot' : 'sdot error';
}

function showGraphLoading(stepText, hintText) {
  const overlay = document.getElementById('graphLoadingOverlay');
  const stepEl = document.getElementById('graphLoadingStep');
  const hintEl = document.getElementById('graphLoadingHint');
  if (overlay) {
    overlay.classList.remove('hidden');
    if (stepEl) stepEl.textContent = stepText || '데이터 로딩 중...';
    if (hintEl) hintEl.textContent = hintText || '잠시만 기다려 주세요';
  }
}

function hideGraphLoading() {
  const overlay = document.getElementById('graphLoadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

/* ═══════════════════════════════════════════
   GRAPH ENGINE
═══════════════════════════════════════════ */
const svg   = document.getElementById('graphSvg');
const edgeG = document.getElementById('edgeGroup');
const nodeG = document.getElementById('nodeGroup');
const tooltip = document.getElementById('tooltip');

/** 캔버스 크기 단일 소스: 컨테이너(#graphArea) 기준으로 SVG에 명시적 width/height 설정.
 *  CSS만 100%로 두면 SVG 내부 좌표계가 기본값(300x150 등)으로 잡혀 "작은 구석"만 쓰는 문제 방지. */
function getGraphViewport() {
  const graphArea = document.getElementById('graphArea');
  if (!graphArea || !svg) return { width: 900, height: 600 };
  const w = Math.max(graphArea.clientWidth || 0, 400);
  const h = Math.max(graphArea.clientHeight || 0, 300);
  if (w > 0 && h > 0) {
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
  }
  return { width: w || 900, height: h || 600 };
}

/** Ego-Graph 전용: HOLDS_SHARES 방향(holder→company)으로 계층 배치. 한 레이어에 노드 많으면 여러 행으로 줄바꿈해 겹침 방지. */
function computeHierarchicalLayout(egoId) {
  const connectedNodeIds = new Set();
  EDGES.forEach(e => { connectedNodeIds.add(e.from); connectedNodeIds.add(e.to); });
  const nodes = NODES.filter(n => connectedNodeIds.has(n.id));
  if (nodes.length === 0) return;

  const { width: W, height: H } = getGraphViewport();
  const padding = LAYOUT_CONFIG.ego.padding;
  const minNodeSpacing = LAYOUT_CONFIG.ego.minNodeSpacing;
  const width = W - 2 * padding;

  const layerBy = {};
  layerBy[egoId] = 0;
  const queue = [egoId];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const curLayer = layerBy[cur];
    EDGES.forEach(e => {
      if (e.from === cur && !(e.to in layerBy)) { layerBy[e.to] = curLayer + 1; queue.push(e.to); }
      if (e.to === cur && !(e.from in layerBy)) { layerBy[e.from] = curLayer - 1; queue.push(e.from); }
    });
  }
  const layerToIds = {};
  nodes.forEach(n => {
    if (layerBy[n.id] == null) layerBy[n.id] = 0;
    const L = layerBy[n.id];
    if (!layerToIds[L]) layerToIds[L] = [];
    layerToIds[L].push(n.id);
  });
  const minL = Math.min(...Object.values(layerBy));
  const maxL = Math.max(...Object.values(layerBy));
  const sortedLayers = [...new Set(Object.keys(layerToIds).map(Number))].sort((a, b) => a - b);

  const perRow = Math.max(1, Math.floor(width / minNodeSpacing));
  const subRowHeight = LAYOUT_CONFIG.ego.subRowHeight;
  const layerRowCount = {};
  let maxRowsInLayer = 1;
  sortedLayers.forEach(L => {
    const count = layerToIds[L].length;
    const rows = Math.max(1, Math.ceil(count / perRow));
    layerRowCount[L] = rows;
    if (rows > maxRowsInLayer) maxRowsInLayer = rows;
  });
  const minLayerHeight = subRowHeight * maxRowsInLayer;
  const layerHeight = Math.max(minLayerHeight, (H - 2 * padding) / Math.max(1, sortedLayers.length));

  sortedLayers.forEach((L, layerIndex) => {
    const ids = layerToIds[L];
    if (!ids || ids.length === 0) return;
    const rows = layerRowCount[L];
    const perThisRow = Math.ceil(ids.length / rows);
    const baseY = padding + (L - minL) * layerHeight;
    for (let row = 0; row < rows; row++) {
      const start = row * perThisRow;
      const end = Math.min(start + perThisRow, ids.length);
      const slice = ids.slice(start, end);
      const rowY = baseY + (rows > 1 ? (row - (rows - 1) / 2) * subRowHeight : 0);
      slice.forEach((id, i) => {
        const x = slice.length === 1
          ? padding + width / 2
          : padding + (i / (slice.length - 1)) * width;
        positions[id] = { x, y: rowY };
      });
    }
  });
  nodes.forEach(n => {
    if (!positions[n.id]) positions[n.id] = { x: padding + width / 2, y: H / 2 };
  });
}

/** 연결 요소(Connected Components) 탐지 — BFS */
function getConnectedComponents(nodes, edges) {
  const idToNode = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, new Set()));
  edges.forEach(e => {
    if (idToNode.has(e.from) && idToNode.has(e.to)) {
      adj.get(e.from).add(e.to);
      adj.get(e.to).add(e.from);
    }
  });
  const visited = new Set();
  const components = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp = [];
    const queue = [n.id];
    visited.add(n.id);
    while (queue.length) {
      const id = queue.shift();
      comp.push(idToNode.get(id));
      for (const next of adj.get(id)) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length); // 큰 컴포넌트 먼저
}

function initPositions() {
  return new Promise((resolve) => {
    if (!svg) { console.warn('initPositions: svg element not found'); resolve(); return; }
    if (!Array.isArray(NODES) || !Array.isArray(EDGES)) {
      console.warn('initPositions: NODES or EDGES is not an array'); resolve(); return;
    }

    const { width: W, height: H } = getGraphViewport();
    const pad = LAYOUT_CONFIG.force.padding;
    const extent = { xMin: pad, xMax: W - pad, yMin: pad, yMax: H - pad };

    const connectedNodeIds = new Set();
    EDGES.forEach(e => { connectedNodeIds.add(e.from); connectedNodeIds.add(e.to); });
    const allNodes = NODES.filter(n => activeFilters.has(n.type) && connectedNodeIds.has(n.id));
    if (allNodes.length === 0) { resolve(); return; }

    const nodeDegrees = new Map();
    allNodes.forEach(n => {
      nodeDegrees.set(n.id, EDGES.filter(e => e.from === n.id || e.to === n.id).length);
    });
    const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1);
    const centerX = (extent.xMin + extent.xMax) / 2;
    const centerY = (extent.yMin + extent.yMax) / 2;
    const useFullArea = LAYOUT_CONFIG.force.useFullArea !== false;
    const packComponents = LAYOUT_CONFIG.force.packComponents !== false;

    const components = getConnectedComponents(allNodes, EDGES);
    const nComp = components.length;
    const usePacking = packComponents && nComp > 1;

    if (usePacking) {
      const nCols = Math.ceil(Math.sqrt(nComp));
      const nRows = Math.ceil(nComp / nCols);
      const cellW = (extent.xMax - extent.xMin) / nCols;
      const cellH = (extent.yMax - extent.yMin) / nRows;
      components.forEach((comp, idx) => {
        const row = Math.floor(idx / nCols);
        const col = idx % nCols;
        const cx = extent.xMin + (col + 0.5) * cellW;
        const cy = extent.yMin + (row + 0.5) * cellH;
        const radiusX = cellW * 0.4;
        const radiusY = cellH * 0.4;
        comp.forEach((n, i) => {
          const angle = (i / Math.max(comp.length, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 1.2;
          const jitter = 0.7 + Math.random() * 0.6;
          positions[n.id] = {
            x: cx + Math.cos(angle) * radiusX * jitter,
            y: cy + Math.sin(angle) * radiusY * jitter,
          };
        });
      });
    } else {
      const radiusX = useFullArea ? (extent.xMax - extent.xMin) * 0.45 : Math.min(W, H) * 0.4;
      const radiusY = useFullArea ? (extent.yMax - extent.yMin) * 0.45 : Math.min(W, H) * 0.4;
      const sortedNodes = [...allNodes].sort((a, b) => (nodeDegrees.get(b.id) || 0) - (nodeDegrees.get(a.id) || 0));
      sortedNodes.forEach((n, i) => {
        const nd = (nodeDegrees.get(n.id) || 0) / maxDegree;
        let r = nd > 0.8 ? 0.15 + Math.random() * 0.25 : nd < 0.2 ? 0.6 + Math.random() * 0.35 : 0.25 + (1 - nd) * 0.5;
        const angle = (i / Math.max(sortedNodes.length, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 1.6;
        const jitter = 0.85 + Math.random() * 0.3;
        positions[n.id] = {
          x: centerX + Math.cos(angle) * radiusX * r * jitter,
          y: centerY + Math.sin(angle) * radiusY * r * jitter,
        };
      });
    }

    // Force Simulation: Gravity↓ / Repulsion(Collision)↑ / Spring Length 차등(지분율 기반)
    const cfg = LAYOUT_CONFIG.force;
    const minDist = cfg.minDist;
    const repulsionRange = minDist * cfg.repulsionRange;
    const collisionMult = cfg.collisionRadiusMultiplier;
    const idealMin = cfg.idealDistMin;
    const idealMax = cfg.idealDistMax;
    let iter = 0;

    function step() {
      try {
      const batchSize = 12;
      const maxIter = cfg.maxIter;
      for (let i = 0; i < batchSize && iter < maxIter; i++, iter++) {
        allNodes.forEach(n => {
          if (!positions[n.id]) return;
          let fx = 0, fy = 0;
          const r = getLayoutRadius(n); // 라벨 박스 포함 물리적 반지름 (타원/직사각형 충돌)

          const degree = nodeDegrees.get(n.id) || 0;
          const normalizedDegree = degree / maxDegree;

          // Gravity: 비선형 약화 — 중앙 근처에선 힘 미미, 멀어질수록 증가 (F ∝ distance² → 중앙 뭉침 억제)
          const dxToCenter = centerX - positions[n.id].x;
          const dyToCenter = centerY - positions[n.id].y;
          const distToCenter = Math.sqrt(dxToCenter*dxToCenter + dyToCenter*dyToCenter) || 1;
          const gravityMag = (distToCenter * distToCenter) * (normalizedDegree * cfg.gravity * 1e-5);
          fx += (dxToCenter / distToCenter) * gravityMag;
          fy += (dyToCenter / distToCenter) * gravityMag;

          // Repulsion + Collision: 물리적 반지름 기준 + 차수 기반 반발력(슈퍼노드가 더 넓은 자리 요구)
          const degMult = 1 + (degree * (cfg.repulsionDegreeFactor ?? 0.5));
          const effectiveStrength = cfg.repulsionStrength * degMult;
          allNodes.forEach(other => {
            if (n.id === other.id || !positions[other.id]) return;
            const dx = positions[n.id].x - positions[other.id].x;
            const dy = positions[n.id].y - positions[other.id].y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const otherR = getLayoutRadius(other);
            const collisionRadius = (r + otherR) * collisionMult;

            if (dist < collisionRadius) {
              const t = (collisionRadius - dist) / collisionRadius;
              const force = t * t * (effectiveStrength * 2);
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            } else if (dist < repulsionRange) {
              const t = (repulsionRange - dist) / repulsionRange;
              const force = t * t * effectiveStrength;
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
          });

          // Spring: 지분율 기반 목표 길이 (선형 또는 1/√ratio) + 차수 가변 거리
          EDGES.forEach(e => {
            const ratio = Math.min(100, Math.max(0.1, e.ratio || 0));
            let baseIdeal;
            if (cfg.useInverseSqrtEdgeLength && cfg.idealDistBaseLengthForInverseSqrt) {
              const rawL = cfg.idealDistBaseLengthForInverseSqrt / Math.sqrt(ratio);
              baseIdeal = Math.max(idealMin, Math.min(idealMax, rawL));
            } else {
              baseIdeal = idealMax - (ratio / 100) * (idealMax - idealMin);
            }
            const degFrom = nodeDegrees.get(e.from) || 0;
            const degTo = nodeDegrees.get(e.to) || 0;
            const degFactor = cfg.idealDistDegreeFactor ?? 0.2;
            const idealDist = baseIdeal * (1 + (degFrom + degTo) * degFactor);
            if (e.from === n.id && positions[e.to]) {
              const dx = positions[e.to].x - positions[n.id].x;
              const dy = positions[e.to].y - positions[n.id].y;
              const dist = Math.sqrt(dx*dx + dy*dy) || 1;
              const force = (dist - idealDist) / idealDist * cfg.edgeForce;
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
            if (e.to === n.id && positions[e.from]) {
              const dx = positions[e.from].x - positions[n.id].x;
              const dy = positions[e.from].y - positions[n.id].y;
              const dist = Math.sqrt(dx*dx + dy*dy) || 1;
              const force = (dist - idealDist) / idealDist * cfg.edgeForce;
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
          });

          const damping = cfg.damping ?? 0.78;
          positions[n.id].x += fx * damping;
          positions[n.id].y += fy * damping;
          positions[n.id].x = Math.max(extent.xMin, Math.min(extent.xMax, positions[n.id].x));
          positions[n.id].y = Math.max(extent.yMin, Math.min(extent.yMax, positions[n.id].y));
        });
      }
      
      if (iter < maxIter) {
        requestAnimationFrame(step);
      } else {
        // 최종 충돌 해소: 물리적 반지름(원+라벨) 기준으로 분리
        let hasOverlap = false;
        let overlapIterations = 0;
        do {
          hasOverlap = false;
          allNodes.forEach(n => {
            if (!positions[n.id]) return;
            const r1 = getLayoutRadius(n);
            allNodes.forEach(other => {
              if (n.id === other.id || !positions[other.id]) return;
              const r2 = getLayoutRadius(other);
              const dx = positions[n.id].x - positions[other.id].x;
              const dy = positions[n.id].y - positions[other.id].y;
              const dist = Math.sqrt(dx*dx + dy*dy) || 1;
              const minSep = r1 + r2;
              if (dist < minSep) {
                hasOverlap = true;
                const separation = (minSep - dist) / 2;
                positions[n.id].x += (dx / dist) * separation;
                positions[n.id].y += (dy / dist) * separation;
                positions[other.id].x -= (dx / dist) * separation;
                positions[other.id].y -= (dy / dist) * separation;
                positions[n.id].x = Math.max(extent.xMin, Math.min(extent.xMax, positions[n.id].x));
                positions[n.id].y = Math.max(extent.yMin, Math.min(extent.yMax, positions[n.id].y));
                positions[other.id].x = Math.max(extent.xMin, Math.min(extent.xMax, positions[other.id].x));
                positions[other.id].y = Math.max(extent.yMin, Math.min(extent.yMax, positions[other.id].y));
              }
            });
          });
          overlapIterations++;
        } while (hasOverlap && overlapIterations < 50);

        // 공간 효율: 레이아웃 bbox를 extent의 90%를 채우도록 스케일·이동. scale 하한 1로 압축 금지(라벨 겹침 방지).
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        allNodes.forEach(n => {
          const p = positions[n.id];
          if (!p) return;
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
        const spanX = maxX - minX || 1;
        const spanY = maxY - minY || 1;
        const extentW = extent.xMax - extent.xMin;
        const extentH = extent.yMax - extent.yMin;
        const targetW = extentW * 0.9;
        const targetH = extentH * 0.9;
        const scale = Math.max(1, Math.min(targetW / spanX, targetH / spanY, 4));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const extentCx = (extent.xMin + extent.xMax) / 2;
        const extentCy = (extent.yMin + extent.yMax) / 2;
        allNodes.forEach(n => {
          if (!positions[n.id]) return;
          positions[n.id].x = extentCx + (positions[n.id].x - cx) * scale;
          positions[n.id].y = extentCy + (positions[n.id].y - cy) * scale;
          positions[n.id].x = Math.max(extent.xMin, Math.min(extent.xMax, positions[n.id].x));
          positions[n.id].y = Math.max(extent.yMin, Math.min(extent.yMax, positions[n.id].y));
        });

        resolve();
      }
      } catch (err) {
        console.error('initPositions step error:', err);
        resolve();
      }
    }
    try {
      step();
    } catch (syncErr) {
      console.error('initPositions sync error:', syncErr);
      resolve();
    }
  });
}

// 이벤트 리스너 추적 (메모리 누수 방지)
const eventListeners = new WeakMap();

function renderGraph() {
  // Critical: positions가 없으면 렌더링 스킵
  if (NODES.length === 0 || Object.keys(positions).length === 0) {
    console.warn('renderGraph: positions not initialized yet');
    return;
  }
  
  // 기존 이벤트 리스너 정리 (메모리 누수 방지)
  // innerHTML로 DOM을 교체하면 이벤트 리스너가 자동으로 제거되지만,
  // 명시적으로 정리하는 것이 안전함
  edgeG.innerHTML = '';
  nodeG.innerHTML = '';

  // 연결 0건인 노드 필터링: 엣지에 연결된 노드만 표시
  const connectedNodeIds = new Set();
  EDGES.forEach(e => {
    connectedNodeIds.add(e.from);
    connectedNodeIds.add(e.to);
  });
  
  // 타입 필터 + 연결 필터 적용
  const visibleIds = new Set(
    NODES
      .filter(n => activeFilters.has(n.type) && connectedNodeIds.has(n.id))
      .map(n => n.id)
  );

  let missingEdgeCount = 0;
  EDGES.forEach(e => {
    if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return;
    const p1 = positions[e.from], p2 = positions[e.to];
    if (!p1 || !p2) {
      missingEdgeCount++;
      console.warn(`Edge ${e.from} -> ${e.to} skipped: missing positions`);
      return;
    }

    const isSelected = selectedNode && (e.from === selectedNode.id || e.to === selectedNode.id);
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const node2 = NODES.find(n=>n.id===e.to);
    const r2 = NODE_RADIUS[node2?.type] || 18;
    const ex = p2.x - dx/dist * (r2+4);
    const ey = p2.y - dy/dist * (r2+4);

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
    line.setAttribute('x2', ex);   line.setAttribute('y2', ey);
    line.setAttribute('stroke', isSelected ? getThemeColor('pwc-orange') : getThemeColor('edge-stroke'));
    line.setAttribute('stroke-width', isSelected ? 2.5 : 2.0); // 더 두껍게 (1.8 → 2.0)
    line.setAttribute('marker-end', isSelected ? 'url(#arrowhead-active)' : 'url(#arrowhead)');
    line.setAttribute('opacity', isSelected ? 1 : 1.0); // 완전 불투명 (0.85 → 1.0)
    g.appendChild(line);

    // 퍼센트 레이블 표시 조건 완화: 선택된 엣지 또는 지분율 5% 이상
    if (isSelected || e.ratio >= 5) {
      const mx = (p1.x + ex) / 2, my = (p1.y + ey) / 2;
      const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
      const tw = (e.label || '').length * 6.5;
      bg.setAttribute('x', mx - tw/2 - 3); bg.setAttribute('y', my - 9);
      bg.setAttribute('width', tw + 6); bg.setAttribute('height', 16);
      bg.setAttribute('rx', 4);
      bg.setAttribute('fill', isSelected ? getThemeColor('surface-tint') : getThemeColor('surface-overlay'));
      bg.setAttribute('stroke', isSelected ? getThemeColor('border-tint') : getThemeColor('border'));
      bg.setAttribute('stroke-width', '1');
      g.appendChild(bg);

      const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
      txt.setAttribute('x', mx); txt.setAttribute('y', my + 1);
      txt.setAttribute('text-anchor','middle'); txt.setAttribute('dominant-baseline','middle');
      txt.setAttribute('font-size','10'); txt.setAttribute('font-family','var(--mono)');
      txt.setAttribute('font-weight', isSelected ? '600' : '400');
      txt.setAttribute('fill', isSelected ? getThemeColor('pwc-orange') : getThemeColor('text-3') || '#a8998a');
      txt.textContent = e.label || '';
      g.appendChild(txt);
    }

    edgeG.appendChild(g);
  });
  
  // 엣지 렌더링 실패 피드백
  if (missingEdgeCount > 0 && !window.edgeWarningShown) {
    updateStatus(`${missingEdgeCount}개의 관계가 표시되지 않았습니다`, false);
    window.edgeWarningShown = true;
    setTimeout(() => {
      window.edgeWarningShown = false;
    }, 5000);
  }

  // 노드 라벨: 하단/외부 전용, 겹침 회피(Label overlap avoidance)
  const lc = LABEL_CONFIG;
  const labelHeight = 16;
  const labelPositions = [];

  NODES.forEach(n => {
    if (!visibleIds.has(n.id)) return;
    const p = positions[n.id];
    if (!p) return;
    const r = NODE_RADIUS[n.type] || 18;
    const nodeLabel = n.label || 'Unknown';
    const isSelected = selectedNode?.id === n.id;
    const maxLen = isSelected ? lc.maxLengthSelected : lc.maxLength;
    const labelText = nodeLabel.length > maxLen ? nodeLabel.slice(0, maxLen) + '…' : nodeLabel;
    const labelWidth = labelText.length * lc.pxPerChar;
    if (nodeLabel) {
      labelPositions.push({
        nodeId: n.id,
        x: p.x,
        y: p.y + r + lc.labelGap,
        width: labelWidth,
        height: labelHeight,
        isSelected,
        text: labelText,
        nodeRadius: r,
        nodeY: p.y,
      });
    }
  });

  // 겹침 회피: 세로 우선, 가로 겹침 시 X 시프트
  labelPositions.forEach((label, i) => {
    let ay = label.y;
    let ax = label.x;
    const py = lc.minLabelSpacingY;
    const px = lc.minLabelSpacingX;

    for (let j = 0; j < i; j++) {
      const o = labelPositions[j];
      const oy = o.adjustedY ?? o.y;
      const ox = o.adjustedX ?? o.x;
      const dx = Math.abs(ax - ox);
      const dy = Math.abs(ay - oy);
      const hOver = dx < label.width / 2 + o.width / 2 + px;
      const vOver = dy < label.height + py;

      if (hOver && vOver) {
        ay = Math.max(ay, oy + o.height + py);
      }
    }
    for (let j = 0; j < i; j++) {
      const o = labelPositions[j];
      const oy = o.adjustedY ?? o.y;
      const ox = o.adjustedX ?? o.x;
      const dx = Math.abs(ax - ox);
      const dy = Math.abs(ay - oy);
      const hOver = dx < label.width / 2 + o.width / 2 + px;
      const vOver = dy < label.height + py;
      if (hOver && vOver) {
        const shift = label.width / 2 + o.width / 2 + px;
        ax = ax >= ox ? ax + shift : ax - shift;
      }
    }

    NODES.forEach(node => {
      if (!visibleIds.has(node.id)) return;
      const pos = positions[node.id];
      if (!pos) return;
      const nr = NODE_RADIUS[node.type] || 18;
      if (Math.abs(ay - pos.y) < nr + lc.labelGap) {
        ay = Math.max(ay, pos.y + nr + lc.labelGap);
      }
    });

    const { width: svgW, height: svgH } = getGraphViewport();
    label.adjustedY = Math.min(ay, svgH - 20);
    label.adjustedX = Math.max(label.width / 2 + 10, Math.min(svgW - label.width / 2 - 10, ax));
  });

  NODES.forEach(n => {
    if (!visibleIds.has(n.id)) return;
    const p = positions[n.id];
    if (!p) return;
    const r = NODE_RADIUS[n.type] || 18;
    const color = getNodeColor(n); // active/closed 상태에 따라 색상 결정
    const isSelected = selectedNode?.id === n.id;

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('cursor','pointer');
    g.setAttribute('data-id', n.id);

    if (isSelected) {
      const glow = document.createElementNS('http://www.w3.org/2000/svg','circle');
      glow.setAttribute('cx', p.x); glow.setAttribute('cy', p.y);
      glow.setAttribute('r', r + 7);
      glow.setAttribute('fill', color); glow.setAttribute('opacity', '.15');
      g.appendChild(glow);
      const ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
      ring.setAttribute('cx', p.x); ring.setAttribute('cy', p.y);
      ring.setAttribute('r', r + 4);
      ring.setAttribute('fill','none'); ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-width','2'); ring.setAttribute('opacity','.5');
      g.appendChild(ring);
    }

    const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y); circle.setAttribute('r', r);
    circle.setAttribute('fill', isSelected ? color : '#fff');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', isSelected ? 0 : 2);
    circle.setAttribute('filter', isSelected ? `drop-shadow(0 3px 8px ${color}50)` : '');
    g.appendChild(circle);

    // 라벨은 노드 외부(하단) 전용 — 노드 안 텍스트 제거로 가독성 확보
    const nodeLabel = n.label || 'Unknown';
    if (nodeLabel) {
      const labelInfo = labelPositions.find(l => l.nodeId === n.id);
      if (labelInfo) {
        const labelEl = document.createElementNS('http://www.w3.org/2000/svg','text');
        labelEl.setAttribute('x', labelInfo.adjustedX ?? p.x);
        labelEl.setAttribute('y', labelInfo.adjustedY);
        labelEl.setAttribute('text-anchor','middle');
        labelEl.setAttribute('dominant-baseline','middle');
        labelEl.setAttribute('font-size', isSelected ? lc.fontSizeSelected : lc.fontSize);
        labelEl.setAttribute('font-weight', isSelected ? '600' : '500');
        labelEl.setAttribute('font-family','var(--sans)');
        labelEl.setAttribute('fill', isSelected ? '#1a1008' : '#1a1008');
        labelEl.setAttribute('opacity', isSelected ? '1' : '0.92');
        labelEl.textContent = labelInfo.text;
        g.appendChild(labelEl);
      }
    }

    g.addEventListener('mouseenter', (e) => showTooltip(n, e));
    g.addEventListener('mouseleave', hideTooltip);
    g.addEventListener('mousedown', (e) => startNodeDrag(n.id, e));
    g.addEventListener('click', (e) => { e.stopPropagation(); selectNode(n); });

    nodeG.appendChild(g);
  });
}

function startNodeDrag(id, e) {
  e.stopPropagation();
  const svgRect = svg.getBoundingClientRect();
  drag = {
    id,
    startX: (e.clientX - svgRect.left - pan.x) / zoom,
    startY: (e.clientY - svgRect.top  - pan.y) / zoom,
    ox: positions[id].x,
    oy: positions[id].y,
  };
}

svg.addEventListener('mousedown', e => {
  if (drag) return;
  pan.dragging = true;
  pan.startX = e.clientX - pan.x;
  pan.startY = e.clientY - pan.y;
});

window.addEventListener('mousemove', e => {
  if (drag) {
    const svgRect = svg.getBoundingClientRect();
    const mx = (e.clientX - svgRect.left - pan.x) / zoom;
    const my = (e.clientY - svgRect.top  - pan.y) / zoom;
    positions[drag.id] = {x: drag.ox + (mx - drag.startX), y: drag.oy + (my - drag.startY)};
    renderGraph();
    return;
  }
  if (pan.dragging) {
    pan.x = e.clientX - pan.startX;
    pan.y = e.clientY - pan.startY;
    applyTransform();
  }
});

window.addEventListener('mouseup', () => { drag = null; pan.dragging = false; });

svg.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  zoom = Math.max(0.3, Math.min(3, zoom * factor));
  applyTransform();
}, {passive:false});

function applyTransform() {
  edgeG.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${zoom})`);
  nodeG.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${zoom})`);
}

document.getElementById('zoomIn').onclick  = () => { zoom = Math.min(3, zoom*1.2); applyTransform(); };
document.getElementById('zoomOut').onclick = () => { zoom = Math.max(0.3, zoom*0.85); applyTransform(); };
document.getElementById('zoomFit').onclick = fitToView;
document.getElementById('resetViewBtn').onclick = () => { selectedNode=null; fitToView(); renderGraph(); showEmptyPanel(); };

function resetView() { zoom=1; pan={x:0,y:0,startX:0,startY:0,dragging:false}; applyTransform(); }

function fitToView() {
  if (NODES.length === 0) {
    resetView();
    return;
  }
  
  // 모든 노드의 바운딩 박스 계산
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  // 연결 0건인 노드 필터링
  const connectedNodeIds = new Set();
  EDGES.forEach(e => {
    connectedNodeIds.add(e.from);
    connectedNodeIds.add(e.to);
  });
  const visibleNodes = NODES.filter(n => 
    activeFilters.has(n.type) && connectedNodeIds.has(n.id)
  );
  visibleNodes.forEach(n => {
    const p = positions[n.id];
    if (!p) return;
    const r = getLayoutRadius(n); // fit 시 라벨까지 포함한 영역 기준
    minX = Math.min(minX, p.x - r);
    maxX = Math.max(maxX, p.x + r);
    minY = Math.min(minY, p.y - r);
    maxY = Math.max(maxY, p.y + r);
  });
  
  if (minX === Infinity || visibleNodes.length === 0) {
    resetView();
    return;
  }
  
  const { width: W, height: H } = getGraphViewport();

  const nodeW = maxX - minX;
  const nodeH = maxY - minY;

  const padding = 80;
  const viewW = W - padding * 2;
  const viewH = H - padding * 2;

  // 줌: 노드 바운딩이 뷰포트에 맞도록 (빈 그래프/극단 비율 방지)
  const scaleX = viewW / Math.max(nodeW, viewW * 0.2);
  const scaleY = viewH / Math.max(nodeH, viewH * 0.2);
  zoom = Math.min(scaleX, scaleY, 2);
  zoom = Math.max(0.25, zoom);

  // 패닝: 노드 무게중심을 뷰포트 중앙에
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  pan.x = W / 2 - centerX * zoom;
  pan.y = H / 2 - centerY * zoom;
  
  applyTransform();
}

function showTooltip(n, e) {
  const related = EDGES.filter(ed => ed.from===n.id||ed.to===n.id);
  const node = NODES.find(x => x.id === n.id);
  const ratio = EDGES.find(e => (e.from === n.id || e.to === n.id) && e.ratio)?.ratio;
  tooltip.innerHTML = `<strong>${esc(n.label)}</strong><span>${esc(n.sub)}${ratio ? ` · ${ratio}%` : ''} · 연결 ${related.length}개</span>`;
  tooltip.style.display = 'block';
  moveTooltip(e);
}
function moveTooltip(e) {
  const rect = document.getElementById('graphArea').getBoundingClientRect();
  let tx = e.clientX - rect.left + 12;
  let ty = e.clientY - rect.top - 8;
  if (tx + 210 > rect.width) tx -= 220;
  tooltip.style.left = tx + 'px';
  tooltip.style.top  = ty + 'px';
}
function hideTooltip() { tooltip.style.display='none'; }

async function selectNode(n) {
  selectedNode = n;
  renderGraph();
  const detail = await loadNodeDetail(n.id);
  if (detail) {
    renderNodeDetail(detail);
  } else {
    renderNodeDetailFallback(n);
  }
}

function renderNodeDetailFallback(n) {
  document.getElementById('panelEmpty').style.display = 'none';
  const detail = document.getElementById('nodeDetail');
  detail.classList.add('visible');
  const color = getNodeColor(n);
  const badge = {company:'회사',person:'개인주주',major:'최대주주',institution:'기관'}[n.type];
  detail.innerHTML = `
    <div class="nd-header">
      <div class="nd-type-row">
        <span class="nd-type-badge" style="background:${color}18;color:${color};border:1px solid ${color}30;">
          ${badge}
        </span>
      </div>
      <div class="nd-name">${esc(n.label)}</div>
      <div class="nd-sub">${esc(n.sub || '')}</div>
    </div>
    <button class="ego-map-btn anim" onclick="loadEgoGraph('${n.id}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
      이 노드 기준 지배구조 맵 보기
    </button>
    <button class="ask-context-btn anim" onclick="openChatWithContext('${n.id}', '${esc(n.label)}', '${n.type}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10V3a1 1 0 011-1h7a1 1 0 011 1v5a1 1 0 01-1 1H4L2 10z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/></svg>
      이 노드에 대해 AI에게 질문하기
    </button>
  `;
}

async function renderNodeDetail(data) {
  document.getElementById('panelEmpty').style.display = 'none';
  const detail = document.getElementById('nodeDetail');
  detail.classList.add('visible');

  const color = getNodeColor(data);
  const badge = {company:'회사',person:'개인주주',major:'최대주주',institution:'기관'}[data.type];

  detail.innerHTML = `
    <div class="nd-header">
      <div class="nd-type-row">
        <span class="nd-type-badge" style="background:${color}18;color:${color};border:1px solid ${color}30;">
          ${badge}
        </span>
      </div>
      <div class="nd-name">${esc(data.label)}</div>
      <div class="nd-sub">${esc(data.sub || '')}</div>
    </div>

    ${data.stats && data.stats.length > 0 ? `
    <div class="nd-stats">
      ${data.stats.map(s=>`
        <div class="nd-stat">
          <div class="nd-stat-val">${esc(s.val)}</div>
          <div class="nd-stat-key">${esc(s.key)}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${data.related && data.related.length > 0 ? `
    <div class="nd-section">
      <div class="nd-section-title">연결 노드 (${data.related.length})</div>
      <div class="related-list">
        ${data.related.map(r=>`
          <div class="related-item" onclick="selectNodeById('${r.id}')">
            <div class="ri-dot" style="background:${getNodeColor(r)||'#ccc'}"></div>
            <div class="ri-name">${esc(r.label)}</div>
            ${r.ratio ? `<span class="ri-val">${r.ratio}%</span>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    ${data.props && Object.keys(data.props).length > 0 ? `
    <div class="nd-section">
      <div class="nd-section-title">속성</div>
      <div class="props-grid">
        ${Object.entries(data.props).slice(0, 10).map(([k,v])=>`
          <div class="prop-row">
            <span class="prop-key">${esc(k)}</span>
            <span class="prop-val">${esc(String(v))}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <button class="ego-map-btn anim" onclick="loadEgoGraph('${data.id}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
      이 노드 기준 지배구조 맵 보기
    </button>
    <button class="ask-context-btn anim" onclick="openChatWithContext('${data.id}', '${esc(data.label)}', '${data.type}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10V3a1 1 0 011-1h7a1 1 0 011 1v5a1 1 0 01-1 1H4L2 10z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/></svg>
      이 노드에 대해 AI에게 질문하기
    </button>
  `;
}

function selectNodeById(id) {
  const n = NODES.find(x=>x.id===id);
  if (n) selectNode(n);
}

function showEmptyPanel() {
  document.getElementById('panelEmpty').style.display='';
  document.getElementById('nodeDetail').classList.remove('visible');
  document.getElementById('nodeDetail').innerHTML='';
}

/* ═══════════════════════════════════════════
   CHAT
═══════════════════════════════════════════ */
const CONTEXT_SUGGESTIONS = {
  company: (n) => [
    `${n.label}의 최대주주는 누구야?`,
    `${n.label} 지분율 5% 이상 주주 목록`,
    `${n.label} 등기임원 평균보수는?`,
    `${n.label}과 같은 주주를 공유하는 다른 회사는?`,
  ],
  person: (n) => [
    `${n.label}이 보유한 전체 회사 목록`,
    `${n.label}의 총 보유 지분 가치는?`,
    `${n.label}과 같은 회사에 투자한 다른 주주는?`,
  ],
  major: (n) => [
    `${n.label}이 5% 이상 보유한 회사는?`,
    `${n.label}의 포트폴리오 변화 추이`,
    `${n.label}과 지분 겹치는 다른 기관은?`,
  ],
  institution: (n) => [
    `${n.label}의 투자 현황을 보여줘`,
    `${n.label}과 같은 종목에 투자한 다른 기관은?`,
  ],
};

function openChatWithContext(nodeId, label, type) {
  switchTabById('chat');
  chatContext = {nodeId, label, type};
  document.getElementById('ctxBar').classList.remove('util-hidden');
  document.getElementById('ctxChip').textContent=label;
  document.getElementById('chatInput').placeholder=`"${label}"에 대해 질문하세요...`;

  const sugs = CONTEXT_SUGGESTIONS[type]?.({label}) || [];
  const sugState = document.getElementById('sugState');
  if (sugState) {
    sugState.innerHTML = `
      <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">
        <strong style="color:var(--pwc-orange)">${esc(label)}</strong>에 대해 물어볼 수 있어요
      </div>
      <div class="suggestions">
        ${sugs.map(q=>`<button class="sug-item" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
      </div>
    `;
    bindSugButtons(sugState);
  }
}

function clearContext() {
  chatContext = null;
  document.getElementById('ctxBar').classList.add('util-hidden');
  document.getElementById('chatInput').placeholder='이 노드에 대해 질문하세요...';
}

function bindSugButtons(container) {
  container.querySelectorAll('.sug-item').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.dataset.q));
  });
}
bindSugButtons(document.getElementById('chatMsgs'));

async function sendMessage(q) {
  const msgs = document.getElementById('chatMsgs');
  const sugState = document.getElementById('sugState');
  if (sugState) sugState.style.display='none';

  const contextLabel = chatContext ? chatContext.label : null;

  // 사용자 메시지 추가
  msgs.insertAdjacentHTML('beforeend', `
    <div class="msg user anim">
      <div class="msg-bubble">${esc(q)}</div>
    </div>
  `);

  const typingId = 'typing-'+Date.now();
  msgs.insertAdjacentHTML('beforeend', `
    <div class="msg ai" id="${typingId}">
      <div class="typing-bubble">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>
  `);
  msgs.scrollTop = msgs.scrollHeight;

  let responseAdded = false; // 응답이 이미 추가되었는지 추적
  let isSending = false; // 중복 요청 방지

  if (isSending) {
    console.warn('이미 요청 중입니다.');
    return;
  }
  isSending = true;

  try {
    const data = await sendChatMessage(q);
    
    // typing 제거
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    
    // 중복 방지: 이미 응답이 추가되었으면 스킵
    if (responseAdded) return;
    responseAdded = true;

    const srcClass = data.source === 'DB' ? 'src-db' : data.source === 'DB_EMPTY' ? 'src-db-empty' : 'src-llm';
    const srcLabel = data.source === 'DB' ? 'Neo4j 직접 조회' : data.source === 'DB_EMPTY' ? '쿼리 실행, 결과 없음' : '추론 (환각 주의)';
    const srcIcon = data.source === 'LLM' ? '⚠️ ' : '● ';

    // AI 응답 추가 (한 번만)
    const answerText = esc(data.answer || '답변을 생성하지 못했습니다.');
    msgs.insertAdjacentHTML('beforeend', `
      <div class="msg ai anim">
        <div class="msg-bubble">${answerText}</div>
        <div style="display:flex;gap:5px;align-items:center;margin-top:4px;padding:0 4px;">
          <span class="src-tag ${srcClass}">${srcIcon}${srcLabel}</span>
          <span class="msg-meta">${data.elapsed}s</span>
          ${contextLabel ? `<span class="msg-meta">컨텍스트: ${esc(contextLabel)}</span>` : ''}
        </div>
      </div>
    `);
    msgs.scrollTop = msgs.scrollHeight;
  } catch (e) {
    // typing 제거
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    
    // 중복 방지: 이미 응답이 추가되었으면 스킵
    if (responseAdded) {
      isSending = false;
      return;
    }
    responseAdded = true;

    // 에러 메시지 추가 (한 번만)
    msgs.insertAdjacentHTML('beforeend', `
      <div class="msg ai anim">
        <div class="msg-bubble" style="color:var(--pwc-red);">오류: ${esc(e.message)}</div>
      </div>
    `);
    msgs.scrollTop = msgs.scrollHeight;
  } finally {
    isSending = false;
  }
}

let isSending = false; // 중복 전송 방지 플래그
let isComposing = false; // IME composition 상태 추적

function handleSend() {
  if (isSending || isComposing) return; // 전송 중이거나 composition 중이면 무시
  const v = document.getElementById('chatInput').value.trim();
  if (!v) return;
  document.getElementById('chatInput').value='';
  isSending = true;
  sendMessage(v).finally(() => {
    isSending = false;
  });
}

document.getElementById('chatSend').addEventListener('click', handleSend);

// IME composition 이벤트 처리 (한글 입력 완료 감지)
document.getElementById('chatInput').addEventListener('compositionstart', () => {
  isComposing = true;
});
document.getElementById('chatInput').addEventListener('compositionend', () => {
  isComposing = false;
});

document.getElementById('chatInput').addEventListener('keydown', e => {
  // IME composition 중이면 Enter 무시 (한글 입력 완료 전 방지)
  if (e.key==='Enter' && !e.shiftKey && !isComposing && !e.isComposing) {
    e.preventDefault();
    handleSend();
  }
});
document.getElementById('chatInput').addEventListener('input', function(){
  this.style.height='auto';
  this.style.height=Math.min(this.scrollHeight,80)+'px';
});

/* ═══════════════════════════════════════════
   TABS & PANEL TOGGLE
═══════════════════════════════════════════ */
function switchTab(el) {
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const tab = el.dataset.tab;
  const detailTab = document.getElementById('detailTab');
  const chatTab = document.getElementById('chatTab');
  
  if (tab === 'detail') {
    detailTab.classList.remove('util-hidden');
    chatTab.classList.add('util-hidden');
  } else {
    detailTab.classList.add('util-hidden');
    chatTab.classList.remove('util-hidden');
  }
}
function switchTabById(id) {
  const el = document.querySelector(`.ptab[data-tab="${id}"]`);
  if (el) switchTab(el);
}

let panelOpen = true;
function togglePanel() {
  const panel = document.getElementById('sidePanel');
  const btn   = document.getElementById('panelToggle');
  panelOpen = !panelOpen;
  if (panelOpen) {
    panel.style.width = 'var(--panel-w)';
    btn.innerHTML = `<svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M2 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn.style.left = '-20px'; // 사이드바 왼쪽 경계
  } else {
    panel.style.width = '0';
    btn.innerHTML = `<svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M6 2l-4 4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn.style.left = '0'; // 그래프 영역 오른쪽 경계
  }
  // 패널 토글 후 그래프 재배치 (사이드바 너비 변경 반영)
  setTimeout(async () => {
    await initPositions();
    renderGraph();
    fitToView();
  }, 250);
}

/* ═══════════════════════════════════════════
   FILTER
═══════════════════════════════════════════ */
// 노드 유형 개수 업데이트 함수 (필터에서 노드 유형으로 이동)
function updateFilterCounts() {
  Object.keys(nodeCounts).forEach(type => {
    const countEl = document.querySelector(`.legend-count[data-count-type="${type}"]`);
    if (countEl) {
      const count = nodeCounts[type] || 0;
      countEl.textContent = `${count.toLocaleString()} 건`;
    }
  });
}

async function toggleFilter(el) {
  const f = el.dataset.filter;
  if (activeFilters.has(f)) {
    if (activeFilters.size > 1) { activeFilters.delete(f); el.classList.remove('active'); }
  } else {
    activeFilters.add(f); el.classList.add('active');
  }
  
  // 필터 변경 후 디버깅 정보
  const connectedNodeIds = new Set();
  EDGES.forEach(e => {
    connectedNodeIds.add(e.from);
    connectedNodeIds.add(e.to);
  });
  const visibleNodes = NODES.filter(n => activeFilters.has(n.type) && connectedNodeIds.has(n.id));
  console.log(`필터 변경: ${f}, 활성 필터: [${Array.from(activeFilters).join(', ')}], 표시 가능한 노드: ${visibleNodes.length}개`);
  
  if (visibleNodes.length === 0) {
    console.warn('필터 적용 후 표시할 노드가 없습니다. 그래프를 다시 로드합니다.');
    await loadGraph(); // 그래프 재로드
    return;
  }
  
  await initPositions(); // 필터 변경 시 재배치
  renderGraph();
  setTimeout(fitToView, 100);
}

/* ═══════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════ */
document.getElementById('nodeSearch').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  if (!q) { renderGraph(); return; }
  const match = NODES.find(n => n.label.toLowerCase().includes(q));
  if (match) { selectedNode=match; renderGraph(); selectNode(match); }
});

/* ═══════════════════════════════════════════
   UTIL
═══════════════════════════════════════════ */
function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
window.addEventListener('resize', async () => {
  getGraphViewport(); // 캔버스 크기 먼저 동기화
  await initPositions();
  renderGraph();
  setTimeout(fitToView, 100);
});
loadGraph();
