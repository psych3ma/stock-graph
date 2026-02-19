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
// CTO: Vis.js 단일 렌더링 엔진 (SVG 제거, 유지보수성/확장성 향상)
const GRAPH_CONFIG = {
  limits: { nodes: 500, edges: 200, nodesFallback: 50 },
  nodeTypes: ['company', 'person', 'major', 'institution'],
  minRatio: 5, // 초기 로딩 시 N% 미만 지분 관계 제외 (Cypher 가지치기, 노이즈·뭉침 감소)
  useServerLayout: true, // 서버 레이아웃 API 사용 (협업: 백엔드 단일 소스), 실패 시 클라이언트 force로 폴백
  layoutEngine: 'pygraphviz',   // PyGraphviz (neato 엔진, 결정론적 레이아웃), 실패 시 NetworkX 폴백
};

// P2: 운영 설정 상수화 (타임아웃, API 제한 등)
const API_CONFIG = {
  timeout: 30000, // API 요청 타임아웃 (ms)
  retryDelay: 1000, // 재시도 지연 (ms)
};

// 레이아웃 정책 (협업 문서): ratio(지분%) → 시각적 거리. "높은 지분 = 가까이"로 통일.
// - 서버(NetworkX): spring_layout weight=ratio. - 클라이언트(force): idealDist ∝ 1/√ratio (useInverseSqrtEdgeLength).
// Force Simulation — CTO: 초기 배치 + 물리 엔진이 실시간으로 퍼뜨려야 "별자리" 가능. 격자/기본값만 쓰면 4군데 뭉침.
// CTO: 초기 뷰 제한 설정 (대량 노드 환경 가독성 개선)
const INITIAL_VIEW_CONFIG = {
  enabled: true, // 초기 뷰 제한 활성화
  minConnections: 3, // 최소 연결 수
  minRatio: 5, // 최소 지분율 (%)
  showTypes: ['company', 'major', 'institution'], // 표시할 노드 타입 (개인주주 제외)
  maxNodes: 1000, // 최대 표시 노드 수
};

const LAYOUT_CONFIG = {
  force: {
    gravity: 0,
    minDist: 800,               // CTO: 노드 간 최소 거리 대폭 증가 (500→800) - 밀집 방지
    repulsionRange: 6.0,        // CTO: 반발 범위 확대 (5.0→6.0)
    repulsionStrength: 600,     // CTO: 반발력 강화 (450→600) - 노드 분리 강화
    collisionRadiusMultiplier: 8.0, // CTO: 충돌 감지 반경 확대 (5.0→8.0)
    layoutRadiusMultiplier: 5,  // CTO: 레이아웃 반경 확대 (4→5)
    idealDistMin: 800,         // CTO: 이상 거리 최소값 증가 (500→800)
    idealDistMax: 2000,        // CTO: 이상 거리 최대값 증가 (1200→2000)
    idealDistDegreeFactor: 0.2,
    useInverseSqrtEdgeLength: true,
    idealDistBaseLengthForInverseSqrt: 2000,
    repulsionDegreeFactor: 0.5,
    edgeForce: 0.022,           // 약화: 링크가 컴포넌트 중심으로 당기는 힘 감소 (스스로 퍼짐)
    maxIter: 1200,             // 반발 워밍업 + 본 시뮬 여유
    repulsionOnlyIter: 300,    // UX: 반발 워밍업 확대 (250→300)
    padding: 100,
    useFullArea: true,
    damping: 0.82,              // 약간 상향: 튕김 완화하면서도 수렴
    packComponents: true,
    expansionFromCenter: 0.04,  // 무게중심에서 바깥으로 밀어내기 강화
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

/**
 * CTO: 노드 채우기 색상 생성 (범례와 일치하도록 연한 버전)
 * @param {string} hexColor - 헥스 색상 코드
 * @param {number} opacity - 투명도 (0-1)
 * @returns {string} RGBA 색상 문자열
 */
function getNodeFillColor(hexColor, opacity = 0.15) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return `rgba(255, 255, 255, ${opacity})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/**
 * CTO: 헥스 색상을 RGB로 변환
 * @param {string} hex - 헥스 색상 코드 (#RRGGBB)
 * @returns {Object|null} {r, g, b} 객체 또는 null
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * UX: 안전한 엣지 라벨 포맷팅 함수
 * 백엔드에서 오는 다양한 형식의 데이터를 안전하게 처리
 * @param {Array} edges - 엣지 배열
 * @returns {string} 포맷된 라벨 문자열
 */
function formatEdgeLabel(edges) {
  // 안전한 숫자 추출 함수 (문자열, 숫자, null 등 모든 경우 처리)
  const safeNumber = (val) => {
    if (val == null || val === '') return 0;
    if (typeof val === 'string') {
      // 문자열에서 숫자만 추출 (예: "22.0%" → 22.0, "3.2%" → 3.2, "22.0% (2건)" → 22.0)
      const cleaned = val.toString().replace(/[^\d.]/g, '');
      const num = parseFloat(cleaned);
      return Number.isNaN(num) ? 0 : num;
    }
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  };
  
  // 최대 지분율 계산 (여러 엣지 중 최대값)
  const ratios = edges.map(ed => safeNumber(ed.ratio));
  const maxRatio = Math.max(...ratios, 0);
  const ratio = Math.max(0, Math.min(100, maxRatio));
  
  // 관계 건수 계산
  const relCount = edges.reduce((sum, ed) => {
    const count = safeNumber(ed.count);
    return sum + (count > 0 ? count : 1);
  }, 0);
  
  // UX: 0%인데 관계가 있는 경우 처리 (사용자 혼란 방지)
  if (ratio === 0 && relCount > 0) {
    // 0%인데 관계가 있는 경우: 건수가 많을 때만 표시하거나 숨김
    // 사용자 혼란 방지를 위해 건수가 많을 때만 표시
    return relCount > 5 ? `${relCount}건` : '';
  }
  
  // UX: 라벨 포맷팅 (명확하고 간결하게)
  if (relCount > 1) {
    return `${ratio.toFixed(1)}% (${relCount}건)`;
  }
  
  return `${ratio.toFixed(1)}%`;
}
const NODE_RADIUS = { company:22, person:16, major:20, institution:18 };

/**
 * CTO: 노드 크기 계산 함수 (데이터 기반 동적 크기)
 * 연결 수와 지분율을 고려하여 노드의 중요도를 크기에 반영
 * @param {Object} node - 노드 객체
 * @param {Array} edges - 엣지 배열
 * @param {string|null} selectedNodeId - 선택된 노드 ID
 * @param {Set} connectedNodeIds - 연결된 노드 ID Set
 * @returns {number} 계산된 노드 크기 (px)
 */
function calculateNodeSize(node, edges, selectedNodeId, connectedNodeIds) {
  const baseRadius = NODE_RADIUS[node.type] || 18;
  const baseSize = baseRadius * 2;
  
  // 연결 수 계산
  const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  
  // 전체 노드의 평균 연결 수 계산 (캐싱)
  if (!window._avgDegree || !window._maxDegree) {
    const allDegrees = NODES.map(n => 
      EDGES.filter(e => e.from === n.id || e.to === n.id).length
    );
    window._avgDegree = allDegrees.reduce((a, b) => a + b, 0) / Math.max(allDegrees.length, 1);
    window._maxDegree = Math.max(...allDegrees, 1);
  }
  const avgDegree = window._avgDegree;
  const maxDegree = window._maxDegree;
  
  // 연결 수 기반 크기 보정
  let degreeFactor = 1.0;
  if (degree >= maxDegree * 0.7) {
    degreeFactor = 1.3;      // 상위 30%: +30%
  } else if (degree >= avgDegree * 1.5) {
    degreeFactor = 1.2;      // 평균의 1.5배 이상: +20%
  } else if (degree >= avgDegree) {
    degreeFactor = 1.1;      // 평균 이상: +10%
  } else if (degree < avgDegree * 0.5 && degree > 0) {
    degreeFactor = 0.9;      // 평균의 절반 미만: -10%
  } else if (degree === 0) {
    degreeFactor = 0.85;     // 연결 없음: -15%
  }
  
  // 지분율 기반 크기 보정 (선택적, 데이터 있는 경우만)
  let ratioFactor = 1.0;
  if (nodeEdges.length > 0) {
    const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)));
    if (maxRatio > 20) {
      ratioFactor = 1.15;  // 20% 이상 지분: +15%
    } else if (maxRatio > 10) {
      ratioFactor = 1.08; // 10% 이상 지분: +8%
    } else if (maxRatio > 5) {
      ratioFactor = 1.04;  // 5% 이상 지분: +4%
    }
  }
  
  // 상태별 조정
  const isSelected = selectedNodeId === node.id;
  const isConnected = selectedNodeId ? connectedNodeIds.has(node.id) : false;
  let stateFactor = 1.0;
  if (isSelected) {
    stateFactor = 1.2;    // 선택: +20%
  } else if (!isConnected && selectedNodeId) {
    stateFactor = 0.7;    // 비연결: -30%
  }
  
  // 최종 크기 계산
  const finalSize = baseSize * degreeFactor * ratioFactor * stateFactor;
  
  // 크기 제한 (가독성 및 성능 보장)
  const minSize = Math.max(16, baseSize * 0.6);  // 최소 16px 또는 기본의 60%
  const maxSize = Math.min(80, baseSize * 1.8);  // 최대 80px 또는 기본의 180%
  return Math.max(minSize, Math.min(maxSize, finalSize));
}

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
  maxLabelDropFromNode: 120, // 겹침 회피로 밀 때, 노드 기준 자연 위치에서 최대 Npx 아래까지만 (라벨-노드 분리 방지)
  fontSize: 11,
  fontSizeSelected: 13,
};

/** 지분율(%) 표시용: 0~100으로 clamp. API/원시 데이터 오류(100% 초과) 시에도 잘못된 수치 노출 방지. */
function formatRatio(val) {
  if (val == null || val === '') return '';
  const n = Number(val);
  if (Number.isNaN(n)) return '';
  return Math.min(100, Math.max(0, n));
}

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
// CTO: SVG 제거로 drag/pan/zoom 변수 불필요 (Vis.js가 내부적으로 처리)
let selectedNode = null;
let activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
let nodeCounts = Object.fromEntries(GRAPH_CONFIG.nodeTypes.map(t => [t, 0])); // 노드 타입별 개수
let chatContext = null;
let nodeDetailCache = {};
let isEgoMode = false;
let egoCenterId = null;
// CTO: UX 패턴 - 선택된 노드와 연결된 노드 추적 (dimming 효과용)
let selectedNodeId = null;
let connectedNodeIds = new Set();

/* ═══════════════════════════════════════════
   API
═══════════════════════════════════════════ */
async function apiCall(endpoint, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
  
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

/** NetworkX 레이아웃 API 호출. 0~1 정규화 좌표를 뷰포트 픽셀로 스케일. 협업: ratio → 시각적 거리 규칙은 백엔드와 동일. */
async function fetchServerLayout(nodes, edges, viewportW, viewportH) {
  const pad = LAYOUT_CONFIG.force.padding;
  const innerW = Math.max(1, viewportW - 2 * pad);
  const innerH = Math.max(1, viewportH - 2 * pad);
  const engine = GRAPH_CONFIG.layoutEngine || 'networkx';
  const body = {
    nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label })),
    edges: edges.map(e => ({ from: e.from, to: e.to, ratio: Math.max(0.1, Math.min(100, e.ratio || 0)) })),
    width: 1,
    height: 1,
    padding: 0.05,
    use_components: true,
    engine: engine,
  };
  const res = await apiCall('/api/v1/graph/layout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res || !res.positions) return null;
  const out = {};
  for (const [id, p] of Object.entries(res.positions)) {
    if (p && typeof p.x === 'number' && typeof p.y === 'number') {
      out[id] = { x: pad + p.x * innerW, y: pad + p.y * innerH };
    }
  }
  return out;
}

async function loadEgoGraph(nodeId) {
  try {
    isEgoMode = true;
    egoCenterId = nodeId;
    // CTO: UX 개선 - 메시지 일관성 유지
    showGraphLoading(LOADING_MESSAGES.loadingEgo, LOADING_GUIDANCE.loadingEgo, null, 0);
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
    if (visNetwork) {
      setTimeout(() => visNetwork.fit({ animation: { duration: 300 } }), 100);
    }
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

// CTO: DOM 준비 상태 확인 함수 추가
function ensureDOMReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve);
    } else if (document.readyState === 'interactive' || document.readyState === 'complete') {
      resolve();
    } else {
      // 안전장치: 최대 5초 대기
      setTimeout(resolve, 5000);
    }
  });
}

async function loadGraph() {
  try {
    // CTO: DOM 준비 상태 확인
    await ensureDOMReady();
    
    // CTO: 컨테이너 존재 사전 확인
    const container = document.getElementById('visNetwork');
    if (!container) {
      const legacyContainer = document.getElementById('visNetworkContainer');
      console.error('초기화 시점에 visNetwork 컨테이너를 찾을 수 없습니다:', {
        readyState: document.readyState,
        graphAreaExists: !!document.getElementById('graphArea'),
        legacyIdFound: !!legacyContainer,
        allIds: Array.from(document.querySelectorAll('[id]')).slice(0, 20).map(el => el.id)
      });
      updateStatus('그래프 영역 초기화 실패 - 페이지를 새로고침해주세요', false);
      // 레거시 ID가 있으면 계속 진행 (자동 복구)
      if (!legacyContainer) {
        return;
      }
    }
    
    isEgoMode = false;
    egoCenterId = null;
    const banner = document.getElementById('egoBanner');
    if (banner) banner.classList.add('util-hidden');
    updateStatus('데이터 로딩 중...', false);
    // CTO: UX 개선 - 메시지 일관성 유지
    showGraphLoading(LOADING_MESSAGES.connecting, LOADING_GUIDANCE.connecting, null, 0);

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
    // CTO: UX 개선 - 명확한 시간 안내 ("최대 1분까지")
    showGraphLoading('그래프 데이터 불러오는 중…', '데이터가 많으면 최대 1분까지 걸릴 수 있습니다', 25, 1);

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
    // CTO: UX 개선 - 메시지 일관성 유지
    showGraphLoading(LOADING_MESSAGES.loadingNodes, LOADING_GUIDANCE.loadingNodes, 50, 1);

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
        // CTO: 개발 환경에서만 로그 출력
        const isDevelopment = window.location.hostname === 'localhost' || 
                              window.location.hostname === '127.0.0.1' ||
                              window.location.protocol === 'file:';
        if (isDevelopment) {
          console.debug(`누락된 노드 ${missingNodes.length}개 추가 로드 완료`);
        }
      } catch (e) {
        console.warn('누락된 노드 로드 실패:', e);
      }
    }
    
    // 엣지 필터링: 양쪽 노드가 모두 로드된 엣지만 유지
    const finalNodeIds = new Set(NODES.map(n => n.id));
    EDGES = EDGES.filter(e => finalNodeIds.has(e.from) && finalNodeIds.has(e.to));
    
    // CTO: 구조화된 로그 출력 (프로덕션 환경에서는 숨김)
    const isDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.protocol === 'file:';
    
    const typeCounts = {
      company: NODES.filter(n => n.type === 'company').length,
      person: NODES.filter(n => n.type === 'person').length,
      major: NODES.filter(n => n.type === 'major').length,
      institution: NODES.filter(n => n.type === 'institution').length,
    };
    
    if (isDevelopment) {
      console.info('그래프 로드 완료:', {
        nodes: NODES.length,
        edges: EDGES.length,
        nodeTypes: typeCounts,
        timestamp: new Date().toISOString()
      });
    }
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
    // CTO: UX 개선 - 메시지 일관성 유지
    showGraphLoading(LOADING_MESSAGES.computingLayout, LOADING_GUIDANCE.computingLayout, 75, 2);
    // CTO: 초기 배치가 "격자/기본값"만 쓰지 않도록 뷰포트가 준비된 뒤 레이아웃 실행
    await new Promise(r => requestAnimationFrame(r));
    getGraphViewport();
    let vp = getGraphViewport();
    if (vp.width * vp.height < 20000) {
      await new Promise(r => setTimeout(r, 80));
      vp = getGraphViewport();
    }
    // CTO: 타 서비스 패턴 - 서버 레이아웃은 초기 위치 힌트로만 사용
    // 실제 레이아웃은 Vis.js physics가 자동으로 계산
    let layoutDone = false;
    if (GRAPH_CONFIG.useServerLayout) {
      const graphView = buildGraphView(NODES, EDGES, activeFilters);
      if (graphView.allNodes.length > 0) {
        const nodeIdSet = new Set(graphView.allNodes.map(n => n.id));
        const edgesForLayout = EDGES.filter(e => nodeIdSet.has(e.from) && nodeIdSet.has(e.to));
        try {
          const serverPos = await fetchServerLayout(graphView.allNodes, edgesForLayout, vp.width, vp.height);
          if (serverPos && Object.keys(serverPos).length >= graphView.allNodes.length) {
            // 서버 레이아웃을 초기 위치로 사용 (physics가 이를 기반으로 최적화)
            Object.assign(positions, serverPos);
            layoutDone = true;
          }
        } catch (e) {
          console.warn('Server layout failed, using Vis.js physics only:', e);
          updateStatus('Vis.js 자동 레이아웃 모드', false);
          setTimeout(() => {
            updateStatus('Neo4j 연결됨', true);
          }, 3000);
        }
      }
    }
    if (!layoutDone) {
      // 서버 레이아웃이 없으면 랜덤 초기 위치로 시작 (physics가 자동으로 최적화)
      // 또는 원형/격자 패턴으로 초기 배치
      try {
        await initPositions();
      } catch (e) {
        console.error('initPositions failed:', e);
        // 실패해도 physics가 자동으로 레이아웃 계산
        positions = {};
      }
    }
    
    updateStatus('렌더링 중...', false);
    // CTO: UX 개선 - 메시지 일관성 유지
    showGraphLoading(LOADING_MESSAGES.rendering, LOADING_GUIDANCE.rendering, 90, 3);
    try {
      // CTO: Vis.js는 waitForVisJs()에서 이미 확인됨
      renderGraph();
      // CTO: Vis.js는 렌더링 후 자동으로 fit
      if (visNetwork) {
        setTimeout(() => {
          visNetwork.fit({ animation: { duration: 300 } });
        }, 100);
      }
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

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY LOADING OVERLAY FUNCTIONS (주석처리 - 참고용)
// 기존: graphLoadingOverlay, graphLoadingStep, graphLoadingHint
// 새로운: loadingOverlay, loadingText, loadingGuidance, loadingSteps, loadingBar
// ═══════════════════════════════════════════════════════════════════════════
/*
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
*/

// ═══════════════════════════════════════════════════════════════════════════
// NEW LOADING OVERLAY FUNCTIONS (Unified Variant)
// CTO: 단계별 진행률 표시, 프로그레스바, 단계 인디케이터 지원
// UX: 명확한 피드백, 접근성 고려, 사용자 친화적 메시지
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// LOADING MESSAGES CONFIG (CTO: 메시지 중앙 관리, 유지보수성 향상)
// ═══════════════════════════════════════════════════════════════════════════
const LOADING_MESSAGES = {
  default: 'UI 구성 중…',
  connecting: '서버 연결 중…',
  loadingData: '그래프 데이터 불러오는 중…',
  loadingNodes: '노드 로딩 중…',
  computingLayout: '그래프 구성 중…',
  rendering: '렌더링 중…',
  loadingEgo: '지배구조 맵 로딩 중…'
};

const LOADING_GUIDANCE = {
  connecting: 'Backend 서버에 연결합니다',
  loadingData: '데이터가 많으면 최대 1분까지 걸릴 수 있습니다', // CTO: UX 개선 - "최대" 명시
  loadingNodes: '연결된 노드 정보를 불러옵니다',
  computingLayout: '노드 위치를 계산합니다 (잠시 걸릴 수 있습니다)',
  rendering: '그래프를 그리는 중입니다',
  loadingEgo: 'Ego-Graph 데이터를 가져옵니다'
};

function showGraphLoading(stepText, hintText, progressPercent = null, activeStep = null) {
  const overlay = document.getElementById('loadingOverlay');
  const textEl = document.getElementById('loadingText');
  const guidanceEl = document.getElementById('loadingGuidance');
  const progressEl = document.getElementById('loadingBar');
  const progressContainer = overlay?.querySelector('.loading-progress');
  const stepsEl = document.getElementById('loadingSteps');
  
  if (!overlay) return;
  
  // 오버레이 표시
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-busy', 'true');
  
  // 메시지 업데이트 (CTO: 기본값 제공)
  if (textEl) textEl.textContent = stepText || LOADING_MESSAGES.default;
  if (guidanceEl) {
    if (hintText) {
      guidanceEl.textContent = hintText;
      guidanceEl.style.display = 'block';
    } else {
      guidanceEl.style.display = 'none';
    }
  }
  
  // 프로그레스바 업데이트
  if (progressPercent !== null && progressEl && progressContainer) {
    const clamped = Math.max(0, Math.min(100, progressPercent));
    progressEl.style.width = `${clamped}%`;
    progressContainer.setAttribute('aria-valuenow', clamped);
    progressContainer.setAttribute('aria-label', `진행률: ${clamped}%`);
    progressContainer.setAttribute('data-progress', `${clamped}%`);
    overlay.classList.add('has-progress');
  } else if (progressEl && progressContainer) {
    // Indeterminate 모드 (애니메이션)
    progressEl.style.width = '0%';
    progressEl.style.animation = 'loading-progress-indeterminate 2s ease-in-out infinite';
    overlay.classList.add('has-progress');
  }
  
  // 단계 인디케이터 업데이트
  if (activeStep !== null && stepsEl) {
    const stepItems = stepsEl.querySelectorAll('.step-item');
    stepItems.forEach((item, idx) => {
      if (idx < activeStep) {
        item.classList.add('completed');
        item.classList.remove('active');
      } else if (idx === activeStep) {
        item.classList.add('active');
        item.classList.remove('completed');
      } else {
        item.classList.remove('active', 'completed');
      }
    });
  }
}

function hideGraphLoading() {
  const overlay = document.getElementById('loadingOverlay');
  const stepsEl = document.getElementById('loadingSteps');
  
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-busy', 'false');
  }
  
  // CTO: 모든 단계 완료 처리
  if (stepsEl) {
    const stepItems = stepsEl.querySelectorAll('.step-item');
    stepItems.forEach(item => {
      item.classList.add('completed');
      item.classList.remove('active');
    });
  }
}

/* ═══════════════════════════════════════════
   GRAPH ENGINE (Vis.js 단일 체제)
═══════════════════════════════════════════ */
// CTO: ID 변경 (tooltip → graphTooltip)
const tooltip = document.getElementById('graphTooltip');

/** CTO: 캔버스 크기 단일 소스 - Vis.js 컨테이너는 CSS 100%로 처리 */
function getGraphViewport() {
  const graphArea = document.getElementById('graphArea');
  if (!graphArea) return { width: 900, height: 600 };
  const w = Math.max(graphArea.clientWidth || 0, 400);
  const h = Math.max(graphArea.clientHeight || 0, 300);
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

/** 협업: 그래프 단일 뷰 모델. 레이아웃/렌더가 동일한 allNodes·차수·컴포넌트 참조. */
function buildGraphView(nodes, edges, typeFilterSet) {
  const connectedNodeIds = new Set();
  edges.forEach(e => { connectedNodeIds.add(e.from); connectedNodeIds.add(e.to); });
  const allNodes = (nodes || []).filter(n => n && n.id && typeFilterSet.has(n.type) && connectedNodeIds.has(n.id));
  const nodeDegrees = new Map();
  allNodes.forEach(n => {
    nodeDegrees.set(n.id, (edges || []).filter(e => e.from === n.id || e.to === n.id).length);
  });
  const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1);
  const components = getConnectedComponents(allNodes, edges || []);
  const idToNode = new Map(allNodes.map(n => [n.id, n]));
  return { allNodes, nodeDegrees, maxDegree, components, idToNode };
}

function initPositions() {
  return new Promise((resolve) => {
    if (!Array.isArray(NODES) || !Array.isArray(EDGES)) {
      console.warn('initPositions: NODES or EDGES is not an array'); resolve(); return;
    }

    const graphView = buildGraphView(NODES, EDGES, activeFilters);
    const { allNodes, nodeDegrees, maxDegree, components } = graphView;
    if (allNodes.length === 0) { resolve(); return; }

    const { width: W, height: H } = getGraphViewport();
    const pad = LAYOUT_CONFIG.force.padding;
    const realExtent = { xMin: pad, xMax: W - pad, yMin: pad, yMax: H - pad };
    const minLayoutW = 700, minLayoutH = 500;
    const layoutW = Math.max(realExtent.xMax - realExtent.xMin, minLayoutW);
    const layoutH = Math.max(realExtent.yMax - realExtent.yMin, minLayoutH);
    const extent = {
      xMin: realExtent.xMin,
      xMax: realExtent.xMin + layoutW,
      yMin: realExtent.yMin,
      yMax: realExtent.yMin + layoutH,
    };

    const centerX = (extent.xMin + extent.xMax) / 2;
    const centerY = (extent.yMin + extent.yMax) / 2;
    const useFullArea = LAYOUT_CONFIG.force.useFullArea !== false;
    const packComponents = LAYOUT_CONFIG.force.packComponents !== false;
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
        // CTO: 노드 겹침 방지 - 노드 수에 비례해 초기 배치 반경 확대
        const minRadiusByCount = Math.max(comp.length * 24, 80); // 16→24, 55→80으로 확대
        const radiusX = Math.min(cellW * 0.48, Math.max(cellW * 0.35, minRadiusByCount));
        const radiusY = Math.min(cellH * 0.48, Math.max(cellH * 0.35, minRadiusByCount));
        comp.forEach((n, i) => {
          const nNorm = Math.max(comp.length, 1);
          const angle = (i / nNorm) * Math.PI * 2 + (Math.random() - 0.5) * 1.2;
          const jitter = 0.75 + Math.random() * 0.5; // 좁은 링 방지
          positions[n.id] = {
            x: cx + Math.cos(angle) * radiusX * jitter,
            y: cy + Math.sin(angle) * radiusY * jitter,
          };
        });
      });
    } else {
      const baseRadiusX = useFullArea ? (extent.xMax - extent.xMin) * 0.5 : Math.min(W, H) * 0.45;
      const baseRadiusY = useFullArea ? (extent.yMax - extent.yMin) * 0.5 : Math.min(W, H) * 0.45;
      // CTO: 노드 겹침 방지 - 단일 컴포넌트도 노드 수에 비례해 원을 크게 확장
      const radiusX = Math.max(baseRadiusX, allNodes.length * 20); // 12→20으로 확대 (밀집 방지)
      const radiusY = Math.max(baseRadiusY, allNodes.length * 20);
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

          // Expansion: 무게중심에서 바깥으로 밀어내기 (순환 출자 4~5각형 뭉침 완화)
          const expK = cfg.expansionFromCenter ?? 0;
          if (expK > 0 && distToCenter > 1) {
            fx += (positions[n.id].x - centerX) / distToCenter * expK;
            fy += (positions[n.id].y - centerY) / distToCenter * expK;
          }

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

          // Spring(링크): 반발 워밍업 구간에서는 적용 안 함 → 먼저 퍼뜨린 뒤 링크로 구조 유지 (CTO)
          const repulsionOnlyIter = cfg.repulsionOnlyIter ?? 0;
          if (repulsionOnlyIter > 0 && iter < repulsionOnlyIter) {
            // 워밍업: 반발+충돌만. 링크 힘 없음.
          } else {
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
          }

          const damping = cfg.damping ?? 0.78;
          positions[n.id].x += fx * damping;
          positions[n.id].y += fy * damping;
          positions[n.id].x = Math.max(extent.xMin, Math.min(extent.xMax, positions[n.id].x));
          positions[n.id].y = Math.max(extent.yMin, Math.min(extent.yMax, positions[n.id].y));
        });
      }
      
      if (iter < maxIter) {
        try { renderGraph(); } catch (_) { /* 레이아웃 중 렌더 실패 시 무시 */ }
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

        // 공간 효율: 레이아웃 bbox를 실제 뷰포트(realExtent) 90%에 맞춤. scale 하한 1로 압축 금지.
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
        const targetW = (realExtent.xMax - realExtent.xMin) * 0.9;
        const targetH = (realExtent.yMax - realExtent.yMin) * 0.9;
        let scale = Math.max(1, Math.min(targetW / spanX, targetH / spanY, 4));
        if (!Number.isFinite(scale) || scale <= 0) scale = 1;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const extentCx = (realExtent.xMin + realExtent.xMax) / 2;
        const extentCy = (realExtent.yMin + realExtent.yMax) / 2;
        allNodes.forEach(n => {
          if (!positions[n.id]) return;
          const x = extentCx + (positions[n.id].x - cx) * scale;
          const y = extentCy + (positions[n.id].y - cy) * scale;
          positions[n.id].x = Number.isFinite(x) ? Math.max(realExtent.xMin, Math.min(realExtent.xMax, x)) : extentCx;
          positions[n.id].y = Number.isFinite(y) ? Math.max(realExtent.yMin, Math.min(realExtent.yMax, y)) : extentCy;
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

let visNetwork = null; // Vis.js 네트워크 인스턴스
let visNetworkEventsSetup = false; // QA: 이벤트 리스너 중복 등록 방지

// CTO: Vis.js 이벤트 리스너 설정 (UX 패턴 반영)
function setupVisNetworkEvents(network) {
  if (visNetworkEventsSetup) return;
  
  // CTO: 노드 클릭 시 네트워크 중심 뷰 + dimming 효과
  network.on('click', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = NODES.find(n => n.id === nodeId);
      if (node) {
        // 선택된 노드 업데이트
        selectedNodeId = nodeId;
        
        // 연결된 노드 ID 수집 (dimming 효과용)
        connectedNodeIds.clear();
        const connectedEdges = network.getConnectedEdges(nodeId);
        connectedEdges.forEach(edgeId => {
          const edge = network.body.data.edges.get(edgeId);
          if (edge) {
            if (edge.from === nodeId) connectedNodeIds.add(edge.to);
            if (edge.to === nodeId) connectedNodeIds.add(edge.from);
          }
        });
        
        // 노드 선택 및 상세 정보 표시
        selectNode(node);
        
        // CTO: 그래프 재렌더링으로 dimming 효과 적용 (먼저 렌더링)
        renderGraph();
        
        // CTO: 네트워크 중심 뷰 - 선택된 노드로 자동 줌/패닝 (렌더링 후 실행)
        // renderGraph() 내부에서 visNetwork가 업데이트되므로, 그 이후에 focus 호출
        setTimeout(() => {
          if (visNetwork) {
            visNetwork.focus(nodeId, {
              scale: 1.5, // 약간 확대
              animation: {
                duration: 400,
                easingFunction: 'easeInOutQuad',
              },
            });
          }
        }, 50); // 렌더링 완료 대기
      }
    } else {
      // 빈 공간 클릭 시 선택 해제
      selectedNodeId = null;
      connectedNodeIds.clear();
      network.unselectAll();
      renderGraph();
      showEmptyPanel();
    }
  });
  
  // CTO: 호버 시 라벨 강조 (가독성 개선)
  network.on('hoverNode', (params) => {
    const node = NODES.find(n => n.id === params.node);
    if (node) {
      showTooltip(node, params.event.x, params.event.y);
      
      // 호버된 노드의 라벨 강조
      const visNode = network.body.data.nodes.get(params.node);
      if (visNode) {
        visNode.font.size = Math.max(visNode.font.size || 12, 16); // 최소 16px
        visNode.font.background = 'rgba(255, 255, 255, 0.95)'; // 배경 강조
        visNode.font.strokeWidth = 3; // 테두리 두께 증가
        network.redraw();
      }
    }
  });
  
  network.on('blurNode', (params) => {
    hideTooltip();
    
    // 호버 해제 시 원래 크기로 복원
    if (params && params.node) {
      const visNode = network.body.data.nodes.get(params.node);
      if (visNode) {
        const node = NODES.find(n => n.id === params.node);
        const isSelected = selectedNodeId === params.node;
        const isConnected = connectedNodeIds.has(params.node);
        
        // 원래 폰트 크기로 복원
        visNode.font.size = isSelected ? 14 : (isConnected ? 13 : 12);
        visNode.font.background = 'white';
        visNode.font.strokeWidth = 2;
        network.redraw();
      }
    }
  });
  
  // 클러스터링: 더블클릭으로 확장/축소 (Vis.js 기본 기능)
  network.on('doubleClick', (params) => {
    if (params.nodes.length > 0 && network.isCluster(params.nodes[0])) {
      network.openCluster(params.nodes[0]);
    }
  });
  
  visNetworkEventsSetup = true;
}

function renderGraphWithVisJs() {
  // Vis.js 렌더링 (PyGraphviz 좌표 + 부드러운 UX)
  if (NODES.length === 0 || Object.keys(positions).length === 0) {
    console.warn('renderGraphWithVisJs: positions not initialized yet');
    return;
  }
  
  // CTO: Vis.js 라이브러리 로드 확인 (필수)
  if (typeof vis === 'undefined' || !vis.Network) {
    console.error('Vis.js not loaded. This should not happen if waitForVisJs() worked correctly.');
    updateStatus('Vis.js 라이브러리 로드 실패', false);
    return;
  }
  
  // CTO: ID 변경 (visNetworkContainer → visNetwork)
  // CTO: 호환성 및 디버깅 강화 - 레거시 ID도 확인하여 명확한 에러 메시지 제공
  let container = document.getElementById('visNetwork');
  
  if (!container) {
    // CTO: 상세한 디버깅 정보 제공
    const graphArea = document.getElementById('graphArea');
    const legacyContainer = document.getElementById('visNetworkContainer');
    const allContainers = graphArea ? Array.from(graphArea.querySelectorAll('[id*="vis"], [id*="network"], [id*="graph"]')) : [];
    
    console.error('Vis.js 컨테이너를 찾을 수 없습니다:', {
      expectedId: 'visNetwork',
      legacyIdFound: !!legacyContainer,
      graphAreaExists: !!graphArea,
      graphAreaChildren: graphArea ? Array.from(graphArea.children).map(c => ({
        id: c.id,
        className: c.className,
        tagName: c.tagName
      })) : [],
      similarContainers: allContainers.map(c => ({
        id: c.id,
        className: c.className
      }))
    });
    
    updateStatus('그래프 컨테이너를 찾을 수 없습니다 - 페이지를 새로고침해주세요', false);
    
    // CTO: 자동 복구 시도 (레거시 ID가 있으면 사용)
    if (legacyContainer) {
      console.warn('레거시 ID visNetworkContainer 발견, 자동 복구 시도');
      container = legacyContainer;
    } else {
      // CTO: 사용자에게 명확한 안내
      console.error('그래프 컨테이너가 없습니다. 페이지를 새로고침하거나 개발자에게 문의하세요.');
      return;
    }
  }
  
  // QA: 컨테이너 크기 초기화 보장 (CSS 100%만으로는 초기 렌더링 실패 가능)
  const { width: vpW, height: vpH } = getGraphViewport();
  if (container.offsetWidth === 0 || container.offsetHeight === 0) {
    container.style.width = vpW + 'px';
    container.style.height = vpH + 'px';
  }
  
  // QA: 필터링 - 모든 활성 필터 노드를 표시 (dimming은 렌더링 시 처리)
  let visibleNodes = NODES.filter(n => activeFilters.has(n.type));
  
  // CTO: 초기 뷰 제한 적용 (대량 노드 환경 가독성 개선)
  if (INITIAL_VIEW_CONFIG.enabled && visibleNodes.length > INITIAL_VIEW_CONFIG.maxNodes) {
    const filteredNodes = visibleNodes.filter(n => {
      // 타입 필터
      if (!INITIAL_VIEW_CONFIG.showTypes.includes(n.type)) return false;
      
      // 연결 수 확인
      const nodeEdges = EDGES.filter(e => e.from === n.id || e.to === n.id);
      const degree = nodeEdges.length;
      const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)), 0);
      
      // 중요도 확인
      if (degree < INITIAL_VIEW_CONFIG.minConnections) return false;
      if (maxRatio < INITIAL_VIEW_CONFIG.minRatio && n.type === 'person') return false;
      
      return true;
    });
    
    // 최대 노드 수 제한 및 중요도 순 정렬
    if (filteredNodes.length > INITIAL_VIEW_CONFIG.maxNodes) {
      visibleNodes = filteredNodes
        .map(n => {
          const nodeEdges = EDGES.filter(e => e.from === n.id || e.to === n.id);
          const degree = nodeEdges.length;
          const maxRatio = Math.max(...nodeEdges.map(e => Number(e.ratio || 0)), 0);
          const importance = (degree * 0.1) + (maxRatio * 0.05);
          return { node: n, importance };
        })
        .sort((a, b) => b.importance - a.importance)
        .slice(0, INITIAL_VIEW_CONFIG.maxNodes)
        .map(item => item.node);
    } else {
      visibleNodes = filteredNodes;
    }
    
    // 사용자에게 알림 (한 번만)
    if (!window._initialViewNotified) {
      updateStatus(`초기 뷰: 중요 노드 ${visibleNodes.length}개만 표시됩니다. 필터를 조정하여 더 많은 노드를 볼 수 있습니다.`, true);
      window._initialViewNotified = true;
      setTimeout(() => {
        if (window._initialViewNotified) {
          updateStatus('Neo4j 연결됨', true);
          window._initialViewNotified = false;
        }
      }, 5000);
    }
  }
  
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = EDGES.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));
  // CTO: UX 패턴 - 노드 상태에 따른 시각적 차별화 (focused/dimmed 효과)
  const visNodes = visibleNodes.map(n => {
    const p = positions[n.id] || { x: vpW / 2, y: vpH / 2 };
    const color = getNodeColor(n);
    const isSelected = selectedNodeId === n.id;
    // QA: 전역 변수 connectedNodeIds 사용 (setupVisNetworkEvents에서 설정됨)
    const isConnected = selectedNodeId ? connectedNodeIds.has(n.id) : false;
    
    // CTO: 데이터 기반 동적 노드 크기 계산 (연결 수 + 지분율 + 상태)
    const nodeSize = calculateNodeSize(n, visibleEdges, selectedNodeId, connectedNodeIds);
    
    // CTO: 노드 상태별 투명도 (dimming 효과)
    let opacity = 1.0;
    if (selectedNodeId) {
      if (isSelected) {
        opacity = 1.0; // 선택된 노드: 완전 불투명
      } else if (isConnected) {
        opacity = 0.75; // 연결된 노드: 약간 투명
      } else {
        opacity = 0.3; // 비연결 노드: 매우 투명
      }
    }
    
    // CTO: 노드 채우기 색상 생성 (범례와 일치하도록 연한 버전)
    const fillColor = getNodeFillColor(color, opacity < 1.0 ? opacity * 0.3 : 0.15);
    
    // CTO: 줌 레벨 기반 라벨 표시 (가독성 개선)
    // CTO: 줌 레벨 기반 라벨 표시 강화 (가독성 개선)
    const currentZoom = visNetwork ? visNetwork.getScale() : 1.0;
    const minZoomForLabels = 1.2; // CTO: 라벨 표시 최소 줌 레벨 증가 (0.7→1.2) - 밀집 방지
    const showLabel = currentZoom >= minZoomForLabels || isSelected || isConnected;
    
    // CTO: 중요도 기반 라벨 표시 (줌 레벨이 낮을 때)
    let labelText = '';
    let labelFontSize = 0;
    if (showLabel) {
      labelText = n.label || n.id;
      // 중요도 계산 (연결 수 기반)
      const nodeEdges = visibleEdges.filter(e => e.from === n.id || e.to === n.id);
      const degree = nodeEdges.length;
      const isImportant = degree >= 10 || isSelected; // CTO: 중요도 기준 상향 (5→10) - 더 중요한 노드만 표시
      
      if (currentZoom < 1.5 && !isImportant && !isSelected && !isConnected) {
        // CTO: 줌 레벨이 낮고 중요하지 않은 노드는 라벨 숨김 (1.0→1.5로 상향)
        labelText = '';
        labelFontSize = 0;
      } else {
        labelFontSize = isSelected ? 14 : (isImportant ? 13 : 12);
      }
    }
    
    return {
      id: n.id,
      label: labelText,
      x: p.x,
      y: p.y,
      // CTO: 타 서비스 패턴 - physics 활성화 시 동적 위치 관리 (안정화 후 고정)
      // fixed 속성 제거: 초기 안정화 전에는 동적, 안정화 후에는 physics: false로 고정
      color: { 
        background: fillColor, // CTO: 채우기 색상 (범례와 일치)
        border: color, 
        highlight: { 
          background: getNodeFillColor(color, 0.3), // 호버 시 더 진하게
          border: color 
        },
        opacity: opacity, // CTO: 투명도 적용
      },
      shape: 'dot',
      size: nodeSize, // CTO: 상태별 크기 차별화
      font: { 
        size: labelFontSize,
        background: labelText ? 'white' : 'transparent', 
        strokeWidth: labelText ? 2 : 0, 
        strokeColor: labelText ? 'white' : 'transparent' 
      },
      borderWidth: isSelected ? 3 : 2, // CTO: 선택 시 테두리 두께 증가
      // CTO: shadow는 전역 옵션에서 설정되며, 개별 노드에서는 boolean 또는 객체로 override 가능
      shadow: isSelected ? {
        enabled: true,
        color: 'rgba(216, 86, 4, 0.4)',
        size: 12,
      } : false, // 선택된 노드만 그림자 효과
    };
  });
  const edgeMap = new Map();
  visibleEdges.forEach(e => {
    const key = `${e.from}-${e.to}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key).push(e);
  });
  // CTO: UX 패턴 - 연결된 엣지만 하이라이트 (네트워크 중심 뷰)
  const connectedEdgeKeys = new Set();
  if (selectedNodeId) {
    visibleEdges.forEach(e => {
      if (e.from === selectedNodeId || e.to === selectedNodeId) {
        connectedEdgeKeys.add(`${e.from}-${e.to}`);
      }
    });
  }
  
  // UX: 줌 레벨 기반 엣지 라벨 표시 (가독성 개선)
  const currentZoom = visNetwork ? visNetwork.getScale() : 1.0;
  const minZoomForEdgeLabels = 1.5; // UX: 엣지 라벨 표시 최소 줌 레벨
  const minRatioForLabel = 1.0; // UX: 라벨 표시 최소 지분율 (%)
  
  const visEdges = Array.from(edgeMap.entries()).map(([key, edges]) => {
    const e = edges[0];
    // Neo4j 전문가 관점:
    // - 동일 from->to 사이 관계가 여러 건(리포트/기준일/주식종류 등) 존재 가능
    // - %를 합산하면 100%를 초과하기 쉬우므로, 시각화 라벨은 max(지분율) + (관계 건수)로 표현
    
    // UX: 안전한 엣지 라벨 포맷팅 (백엔드 데이터 형식 다양성 처리)
    const edgeLabel = formatEdgeLabel(edges);
    
    // 지분율 계산 (라벨 표시 조건 확인용) - formatEdgeLabel 내부 로직 재사용
    const safeNumber = (val) => {
      if (val == null || val === '') return 0;
      if (typeof val === 'string') {
        const cleaned = val.toString().replace(/[^\d.]/g, '');
        const num = parseFloat(cleaned);
        return Number.isNaN(num) ? 0 : num;
      }
      const n = Number(val);
      return Number.isNaN(n) ? 0 : n;
    };
    const ratios = edges.map(ed => safeNumber(ed.ratio));
    const maxRatio = Math.max(...ratios, 0);
    const ratio = Math.max(0, Math.min(100, maxRatio));
    
    // CTO: 연결된 엣지만 하이라이트 (네트워크 중심 뷰)
    const isConnected = connectedEdgeKeys.has(key);
    
    // UX: 줌 레벨 및 중요도 기반 라벨 표시 조건
    let finalLabel = '';
    if (currentZoom >= minZoomForEdgeLabels || isConnected) {
      // 줌 레벨이 높거나 연결된 엣지는 라벨 표시
      finalLabel = edgeLabel;
      
      // UX: 중요도 기반 추가 필터링 (지분율 1% 미만은 숨김, 단 연결된 엣지는 예외)
      if (ratio < minRatioForLabel && !isConnected && currentZoom < 2.0) {
        finalLabel = '';
      }
    }
    
    const edgeColor = isConnected ? '#d85604' : '#8b7d6f'; // 연결: 오렌지, 비연결: 회색
    const edgeOpacity = selectedNodeId ? (isConnected ? 1.0 : 0.2) : 1.0; // 선택 시 비연결 엣지 dimming
    const edgeWidth = isConnected ? Math.max(2, Math.min(5, ratio / 10)) : Math.max(1, Math.min(3, ratio / 15));
    
    return {
      from: e.from,
      to: e.to,
      label: finalLabel, // UX: 조건부 라벨 표시
      smooth: { type: 'continuous', roundness: 0.5 }, // 부드러운 엣지
      width: edgeWidth,
      color: { 
        color: edgeColor, 
        highlight: '#d85604',
        opacity: edgeOpacity, // CTO: 투명도 적용
      },
    };
  });
  const data = { nodes: visNodes, edges: visEdges };
  const options = {
    nodes: {
      font: { background: 'white', strokeWidth: 2, strokeColor: 'white' },
      borderWidth: 2,
      // CTO: UX 패턴 - 그림자 효과 (별처럼 빛나는 효과)
      // 전역 shadow 설정 (개별 노드에서 override 가능)
      shadow: {
        enabled: false, // 기본적으로 비활성화 (선택된 노드만 활성화)
        color: 'rgba(216, 86, 4, 0.4)',
        size: 12,
        x: 0,
        y: 0,
      },
    },
    edges: {
      smooth: { type: 'continuous', roundness: 0.5 },
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
    },
    // CTO: 타 서비스 패턴 - "안정화 후 고정" 전략
    // 초기 렌더링 시 physics 활성화하여 자동 레이아웃, 안정화 완료 후 비활성화
    physics: {
      enabled: true, // 초기 안정화를 위해 활성화
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -60,
        centralGravity: 0.005,
        springLength: 150,
        springConstant: 0.04,
        damping: 0.6,
        avoidOverlap: 0.6, // ⭐ 핵심: 노드 겹침 방지
      },
      stabilization: {
        enabled: true,
        iterations: 100,
        fit: true, // 안정화 완료 후 화면에 맞게 조정
      },
    },
    interaction: { 
      dragNodes: true, 
      zoomView: true, 
      dragView: true,
      tooltipDelay: 100, // 툴팁 지연 감소
    },
    layout: { improvedLayout: false }, // 이미 계산된 좌표 사용
    // CTO: animation은 top-level 옵션이 아님 (moveTo/fit/focus 메서드의 파라미터로만 사용)
    // 노드/엣지 상태 변경 시 부드러운 전환은 physics.enabled=false일 때 자동으로 처리됨
  };
  
  // CTO: 타 서비스 패턴 - 안정화 완료 후 physics 비활성화
  if (visNetwork && !visNetwork._stabilizationHandlerAdded) {
    visNetwork.on('stabilizationIterationsDone', () => {
      // 안정화 완료 후 physics 비활성화하여 위치 고정
      visNetwork.setOptions({ physics: false });
      console.debug('Graph stabilization completed, physics disabled');
    });
    visNetwork._stabilizationHandlerAdded = true;
  }
  
  // CTO: 줌 레벨 변경 시 라벨 표시 업데이트 (가독성 개선)
  if (visNetwork && !visNetwork._zoomHandlerAdded) {
    let zoomTimeout = null;
    visNetwork.on('zoom', () => {
      // UX: 디바운싱으로 성능 최적화 (줌 중에는 재렌더링 지연)
      if (zoomTimeout) clearTimeout(zoomTimeout);
      zoomTimeout = setTimeout(() => {
        // 줌 레벨 변경 시 그래프 재렌더링하여 라벨 표시 업데이트
        renderGraph();
      }, 150); // 150ms 디바운싱
    });
    visNetwork._zoomHandlerAdded = true; // 중복 이벤트 리스너 방지
  }
  try {
    if (visNetwork) {
      // QA: 기존 인스턴스 업데이트
      visNetwork.setData(data);
      visNetwork.setOptions(options);
      // CTO: 타 서비스 패턴 - 데이터 업데이트 시 physics 재활성화 (필터링/데이터 변경 시)
      // 안정화 완료 후 자동으로 physics: false로 전환됨
      visNetwork.setOptions({ physics: true });
    } else {
      // QA: 새 인스턴스 생성 (이벤트 리스너는 setupVisNetworkEvents에서 한 번만 등록)
      visNetwork = new vis.Network(container, data, options);
      setupVisNetworkEvents(visNetwork);
      // 초기 렌더링은 options에서 이미 physics: true로 설정됨
    }
  } catch (err) {
    console.error('Vis.js network creation failed:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      options: JSON.stringify(options, null, 2),
    });
    updateStatus('그래프 렌더링 실패 - 페이지를 새로고침해주세요', false);
    hideGraphLoading();
    // QA: 에러 발생 시 인스턴스 초기화 (재시도 가능하도록)
    visNetwork = null;
    visNetworkEventsSetup = false;
  }
  // 클러스터링: 같은 타입의 노드들을 그룹화 (선택적, 향후 확장)
  // visNetwork.clusterByConnection() 또는 visNetwork.cluster() 사용 가능
}

function renderGraph() {
  // CTO: Vis.js 단일 렌더링 엔진
  if (NODES.length === 0 || Object.keys(positions).length === 0) {
    console.warn('renderGraph: positions not initialized yet');
    return;
  }
  renderGraphWithVisJs();
}

// CTO: Vis.js 단일 체제 - 줌 기능을 Vis.js Network API로 연결
function setupZoomControls() {
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const zoomFitBtn = document.getElementById('zoomFit');
  const resetViewBtn = document.getElementById('resetViewBtn');
  
  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      if (visNetwork) {
        try {
          const scale = visNetwork.getScale();
          visNetwork.moveTo({ scale: Math.min(3, scale * 1.2) });
        } catch (e) {
          console.warn('Zoom in failed:', e);
        }
      } else {
        console.warn('Graph not initialized yet');
      }
    };
  }
  
  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      if (visNetwork) {
        try {
          const scale = visNetwork.getScale();
          visNetwork.moveTo({ scale: Math.max(0.3, scale * 0.85) });
        } catch (e) {
          console.warn('Zoom out failed:', e);
        }
      } else {
        console.warn('Graph not initialized yet');
      }
    };
  }
  
  if (zoomFitBtn) {
    zoomFitBtn.onclick = () => {
      if (visNetwork) {
        try {
          visNetwork.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
        } catch (e) {
          console.warn('Fit to view failed:', e);
        }
      } else {
        console.warn('Graph not initialized yet');
      }
    };
  }
  
  if (resetViewBtn) {
    resetViewBtn.onclick = () => {
      selectedNode = null;
      if (visNetwork) {
        try {
          visNetwork.fit({ animation: { duration: 300 } });
        } catch (e) {
          console.warn('Reset view failed:', e);
        }
      }
      renderGraph();
      showEmptyPanel();
    };
  }
}

// CTO: 초기화 시 줌 컨트롤 설정 (DOM 로드 후)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupZoomControls);
} else {
  setupZoomControls();
}

function showTooltip(n, e) {
  const related = EDGES.filter(ed => ed.from===n.id||ed.to===n.id);
  const node = NODES.find(x => x.id === n.id);
  const ratio = EDGES.find(e => (e.from === n.id || e.to === n.id) && e.ratio)?.ratio;
  const ratioStr = formatRatio(ratio) !== '' ? ` · ${formatRatio(ratio)}%` : '';
  // CTO: UX 개선 - 타 서비스 CSS와 호환 (opacity + visible 클래스)
  tooltip.innerHTML = `<span class="tt-name">${esc(n.label)}</span><span class="tt-type">${esc(n.sub)}${ratioStr} · 연결 ${related.length}개</span>`;
  tooltip.classList.add('visible');
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
// CTO: UX 개선 - opacity 기반 전환 효과 (display 대신)
function hideTooltip() {
  if (tooltip) {
    tooltip.classList.remove('visible');
    tooltip.style.opacity = '0';
  }
}

async function selectNode(n) {
  selectedNode = n;
  selectedNodeId = n.id; // CTO: UX 패턴 - 선택된 노드 ID 저장
  
  // CTO: 연결된 노드 ID 수집 (dimming 효과용)
  if (visNetwork) {
    connectedNodeIds.clear();
    try {
      const connectedEdges = visNetwork.getConnectedEdges(n.id);
      connectedEdges.forEach(edgeId => {
        const edge = visNetwork.body.data.edges.get(edgeId);
        if (edge) {
          if (edge.from === n.id) connectedNodeIds.add(edge.to);
          if (edge.to === n.id) connectedNodeIds.add(edge.from);
        }
      });
    } catch (e) {
      console.warn('Failed to get connected edges:', e);
    }
  }
  
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
  `;
  
  // UX: 액션 버튼을 별도 컨테이너에 추가 (하단 고정용)
  const actionContainer = document.createElement('div');
  actionContainer.className = 'nd-actions';
  actionContainer.innerHTML = `
    <button class="ego-map-btn anim" onclick="loadEgoGraph('${n.id}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
      이 노드 기준 지배구조 맵 보기
    </button>
    <button class="ask-context-btn anim" onclick="openChatWithContext('${n.id}', '${esc(n.label)}', '${n.type}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10V3a1 1 0 011-1h7a1 1 0 011 1v5a1 1 0 01-1 1H4L2 10z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/></svg>
      이 노드에 대해 AI에게 질문하기
    </button>
  `;
  detail.appendChild(actionContainer);
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
      <div class="related-list" id="relatedList">
        ${data.related.slice(0, 3).map(r=>`
          <div class="related-item" onclick="selectNodeById('${r.id}')">
            <div class="ri-dot" style="background:${getNodeColor(r)||'#ccc'}"></div>
            <div class="ri-name">${esc(r.label)}</div>
            ${formatRatio(r.ratio) !== '' ? `<span class="ri-val">${formatRatio(r.ratio)}%</span>` : ''}
          </div>
        `).join('')}
        ${data.related.length > 3 ? `
          <div class="related-item-more hidden" id="relatedMore">
            ${data.related.slice(3).map(r=>`
              <div class="related-item" onclick="selectNodeById('${r.id}')">
                <div class="ri-dot" style="background:${getNodeColor(r)||'#ccc'}"></div>
                <div class="ri-name">${esc(r.label)}</div>
                ${formatRatio(r.ratio) !== '' ? `<span class="ri-val">${formatRatio(r.ratio)}%</span>` : ''}
              </div>
            `).join('')}
          </div>
          ${data.related.length - 3 > 0 ? `
            <button class="related-more-btn" onclick="toggleRelatedMore()">
              <span class="related-more-text">더보기</span>
              <span class="related-more-count">(${data.related.length - 3}개)</span>
              <svg class="related-more-icon" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M3 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          ` : ''}
        ` : ''}
      </div>
    </div>
    ` : ''}

    ${data.props && Object.keys(data.props).length > 0 ? `
    <div class="nd-section">
      <div class="nd-section-title">속성</div>
      <div class="props-grid">
        ${(() => {
          // CTO: 노드 타입별 속성 필터링 및 중복 제거
          const hiddenProps = [
            'createdAt', 'created_at', 'updatedAt',  // 날짜 필드 (UX 요청)
            'nameEmbedding',                          // 임베딩 벡터
          ];
          
          // 중복 제거 및 정규화
          const filtered = { ...data.props };
          
          // Company 노드: companyNameNormalized, biznoOriginal 제외
          if (data.type === 'company') {
            if (filtered.companyName && filtered.companyNameNormalized) {
              if (String(filtered.companyName).toLowerCase() === String(filtered.companyNameNormalized).toLowerCase()) {
                delete filtered.companyNameNormalized;
              }
            }
            if (filtered.bizno && filtered.biznoOriginal) {
              delete filtered.bizno; // biznoOriginal만 표시 (하이픈 포함)
            }
          }
          
          // Stockholder 노드: stockNameNormalized, totalStockRatio 제외
          if (data.type === 'person' || data.type === 'major' || data.type === 'institution') {
            if (filtered.stockName && filtered.stockNameNormalized) {
              if (String(filtered.stockName).toLowerCase() === String(filtered.stockNameNormalized).toLowerCase()) {
                delete filtered.stockNameNormalized;
              }
            }
            if (filtered.maxStockRatio && filtered.totalStockRatio) {
              const maxRatio = Number(filtered.maxStockRatio) || 0;
              const totalRatio = Number(filtered.totalStockRatio) || 0;
              if (Math.abs(maxRatio - totalRatio) < 0.01) {
                delete filtered.totalStockRatio; // 동일하면 하나만 표시
              }
            }
            // Institution: stockName vs companyName
            if (filtered.shareholderType && ['INSTITUTION', 'CORPORATION'].includes(String(filtered.shareholderType).toUpperCase())) {
              if (filtered.stockName && filtered.companyName &&
                  String(filtered.stockName).toLowerCase() === String(filtered.companyName).toLowerCase()) {
                delete filtered.companyName; // stockName 우선 표시
              }
            }
          }
          
          // 빈 값 필터링
          const shouldShow = (key, value) => {
            if (hiddenProps.includes(key)) return false;
            if (value === null || value === undefined) return false;
            if (typeof value === 'string' && value.trim() === '') return false;
            if (typeof value === 'object' && Object.keys(value).length === 0) return false;
            return true;
          };
          
          return Object.entries(filtered)
            .filter(([k, v]) => shouldShow(k, v))
            .slice(0, 10)
            .map(([k,v])=>`
              <div class="prop-row">
                <span class="prop-key">${esc(k)}</span>
                <span class="prop-val">${esc(String(v))}</span>
              </div>
            `).join('');
        })()}
      </div>
    </div>
    ` : ''}
  `;
  
  // UX: 액션 버튼을 별도 컨테이너에 추가 (하단 고정용)
  const actionContainer = document.createElement('div');
  actionContainer.className = 'nd-actions';
  actionContainer.innerHTML = `
    <button class="ego-map-btn anim" onclick="loadEgoGraph('${data.id}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
      이 노드 기준 지배구조 맵 보기
    </button>
    <button class="ask-context-btn anim" onclick="openChatWithContext('${data.id}', '${esc(data.label)}', '${data.type}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10V3a1 1 0 011-1h7a1 1 0 011 1v5a1 1 0 01-1 1H4L2 10z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/></svg>
      이 노드에 대해 AI에게 질문하기
    </button>
  `;
  detail.appendChild(actionContainer);
}

function selectNodeById(id) {
  const n = NODES.find(x=>x.id===id);
  if (n) selectNode(n);
}

// CTO: 연결 노드 더보기 토글 (UX 개선)
function toggleRelatedMore() {
  const moreEl = document.getElementById('relatedMore');
  const btn = event?.target?.closest('.related-more-btn') || document.querySelector('.related-more-btn');
  if (!moreEl || !btn) return;
  
  const textEl = btn.querySelector('.related-more-text');
  const countEl = btn.querySelector('.related-more-count');
  const iconEl = btn.querySelector('.related-more-icon');
  
  if (moreEl.classList.contains('hidden')) {
    moreEl.classList.remove('hidden');
    if (textEl) textEl.textContent = '접기';
    if (countEl) countEl.style.display = 'none';
    if (iconEl) {
      iconEl.style.transform = 'rotate(180deg)';
    }
  } else {
    moreEl.classList.add('hidden');
    const count = parseInt(countEl?.textContent.match(/\d+/)?.[0] || '0');
    if (textEl) textEl.textContent = '더보기';
    if (countEl) {
      countEl.textContent = `(${count}개)`;
      countEl.style.display = 'inline';
    }
    if (iconEl) {
      iconEl.style.transform = 'rotate(0deg)';
    }
  }
}

function showEmptyPanel() {
  document.getElementById('panelEmpty').style.display='';
  document.getElementById('nodeDetail').classList.remove('visible');
  document.getElementById('nodeDetail').innerHTML='';
  // CTO: UX 패턴 - 선택 해제 시 dimming 효과 제거
  selectedNodeId = null;
  connectedNodeIds.clear();
  if (visNetwork) {
    visNetwork.unselectAll();
    renderGraph();
  }
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

// CTO: 대화 이력 초기화 (컨텍스트 초과 에러 해결을 위한 명확한 UX)
async function resetChatHistory() {
  if (!confirm('대화 이력을 초기화하시겠습니까? 이전 대화 내용은 복구할 수 없습니다.')) {
    return;
  }
  
  try {
    await apiCall('/api/v1/chat', {
      method: 'DELETE',
    });
    
    // 채팅 메시지 영역 초기화
    const msgs = document.getElementById('chatMsgs');
    if (msgs) {
      const sugState = document.getElementById('sugState');
      if (sugState) {
        msgs.innerHTML = '';
        msgs.appendChild(sugState);
        sugState.style.display = '';
      } else {
        msgs.innerHTML = `
          <div id="sugState" class="anim">
            <div style="font-size:12px;color:var(--text-3);margin-bottom:10px;">
              노드를 선택하거나 아래 질문을 눌러보세요
            </div>
            <div class="suggestions" id="globalSugs">
              <button class="sug-item" data-q="지분율 50% 이상인 최대주주 목록을 보여줘">지분율 50% 이상 최대주주 목록</button>
              <button class="sug-item" data-q="국민연금이 5% 이상 보유한 회사는 어디야?">국민연금 5% 이상 보유 회사</button>
              <button class="sug-item" data-q="2022년 등기임원 평균보수가 가장 높은 회사 TOP 5">임원보수 TOP 5 (2022년)</button>
              <button class="sug-item" data-q="3개 이상 법인에 투자한 주주를 찾아줘">다중 법인 투자 주주</button>
            </div>
          </div>
        `;
        bindSugButtons(msgs);
      }
    }
    
    // 컨텍스트도 초기화
    clearContext();
    
    // 사용자 피드백
    updateStatus('대화 이력이 초기화되었습니다', true);
    
  } catch (e) {
    console.error('대화 초기화 실패:', e);
    alert('대화 초기화에 실패했습니다. 페이지를 새로고침해주세요.');
  }
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

// CTO: 대화 초기화 버튼 이벤트
const chatResetBtn = document.getElementById('chatResetBtn');
if (chatResetBtn) {
  chatResetBtn.addEventListener('click', resetChatHistory);
}

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
    if (visNetwork) {
      visNetwork.fit({ animation: { duration: 300 } });
    }
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
  
  // QA: 필터 변경 시 모든 활성 필터 노드 표시 (dimming은 렌더링 시 처리)
  const visibleNodes = NODES.filter(n => activeFilters.has(n.type));
  // CTO: 개발 환경에서만 필터 변경 로그 출력
  const isDevelopment = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.protocol === 'file:';
  if (isDevelopment) {
    console.debug('필터 변경:', {
      filter: f,
      activeFilters: Array.from(activeFilters),
      visibleNodes: visibleNodes.length,
      timestamp: new Date().toISOString()
    });
  }
  
  // CTO: 타 서비스 패턴 - 필터링 후 physics 재활성화하여 레이아웃 재안정화
  renderGraph();
  if (visNetwork) {
    // 필터링 후 새로운 노드 구성에 맞게 레이아웃 재계산
    visNetwork.setOptions({ physics: true });
    // 안정화 완료 후 자동으로 physics: false로 전환됨 (stabilizationIterationsDone 이벤트)
  }
  
  if (visibleNodes.length === 0) {
    console.warn('필터 적용 후 표시할 노드가 없습니다. 모든 필터가 비활성화되었습니다.');
    updateStatus('최소 하나의 노드 타입을 선택해주세요', false);
    // 필터를 다시 활성화하여 빈 그래프 방지
    activeFilters.add(f);
    el.classList.add('active');
    return;
  }
  
  // QA: 선택 해제 (필터 변경 시 선택 상태 유지하지 않음)
  selectedNodeId = null;
  connectedNodeIds.clear();
  if (visNetwork) {
    visNetwork.unselectAll();
  }
  
  await initPositions(); // 필터 변경 시 재배치
  renderGraph();
  showEmptyPanel(); // 패널 초기화
  if (visNetwork) {
    setTimeout(() => visNetwork.fit({ animation: { duration: 300 } }), 100);
  }
}

/* ═══════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════ */
let searchTimeout = null;
let searchResults = [];
let selectedSearchIndex = -1;

function performSearch(query) {
  if (!query || query.trim().length === 0) {
    clearSearchHighlight();
    hideSearchResults();
    renderGraph();
    return;
  }
  
  const q = query.toLowerCase().trim();
  searchResults = NODES.filter(n => 
    n.label.toLowerCase().includes(q) || 
    (n.sub && n.sub.toLowerCase().includes(q))
  ).slice(0, 10);
  
  selectedSearchIndex = -1;
  
  if (searchResults.length === 0) {
    showSearchNoResults();
    clearSearchHighlight();
  } else {
    showSearchResults(searchResults, q);
    highlightSearchResults(searchResults);
  }
}

function highlightSearchResults(results) {
  // Vis.js에서 노드 하이라이트
  if (visNetwork && results.length > 0) {
    const nodeIds = results.map(n => n.id);
    visNetwork.selectNodes(nodeIds);
    // 첫 번째 결과로 이동
    if (results.length > 0) {
      visNetwork.focus(results[0].id, {
        scale: 1.5,
        animation: { duration: 300 }
      });
    }
  }
}

function clearSearchHighlight() {
  if (visNetwork) {
    visNetwork.unselectAll();
  }
}

function highlightMatch(text, query) {
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return esc(text).replace(regex, '<mark style="background: var(--pwc-orange); color: white; padding: 0 2px;">$1</mark>');
}

function showSearchResults(results, query) {
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  
  resultsEl.innerHTML = results.map((node, idx) => {
    const label = highlightMatch(node.label, query);
    const typeLabel = { company: '회사', person: '개인주주', major: '최대주주', institution: '기관' }[node.type] || node.type;
    return `
      <div class="search-result-item ${idx === selectedSearchIndex ? 'selected' : ''}" 
           data-node-id="${node.id}" 
           data-index="${idx}">
        <div class="search-result-label">${label}</div>
        <div class="search-result-type">${typeLabel}</div>
      </div>
    `;
  }).join('');
  
  resultsEl.classList.remove('hidden');
  
  // 클릭 이벤트
  resultsEl.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const nodeId = item.dataset.nodeId;
      const node = NODES.find(n => n.id === nodeId);
      if (node) {
        selectNode(node);
        hideSearchResults();
        const searchInput = document.getElementById('nodeSearch');
        if (searchInput) searchInput.value = '';
      }
    });
  });
}

function showSearchNoResults() {
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  
  resultsEl.innerHTML = `
    <div class="search-no-results">
      검색 결과가 없습니다
    </div>
  `;
  resultsEl.classList.remove('hidden');
}

function hideSearchResults() {
  const resultsEl = document.getElementById('searchResults');
  if (resultsEl) {
    resultsEl.classList.add('hidden');
  }
}

function updateSearchSelection() {
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  
  resultsEl.querySelectorAll('.search-result-item').forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedSearchIndex);
  });
}

function setupSearch() {
  const searchInput = document.getElementById('nodeSearch');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', function() {
    const query = this.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });
  
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        selectedSearchIndex = Math.min(selectedSearchIndex + 1, searchResults.length - 1);
        updateSearchSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSearchIndex = Math.max(selectedSearchIndex - 1, -1);
      updateSearchSelection();
    } else if (e.key === 'Enter' && selectedSearchIndex >= 0 && searchResults[selectedSearchIndex]) {
      e.preventDefault();
      const node = searchResults[selectedSearchIndex];
      selectNode(node);
      hideSearchResults();
      this.value = '';
    } else if (e.key === 'Escape') {
      hideSearchResults();
      this.value = '';
      clearSearchHighlight();
      renderGraph();
    }
  });
  
  // 검색창 외부 클릭 시 드롭다운 닫기
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) {
      hideSearchResults();
    }
  });
}

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
// QA: resize 이벤트 최적화 - Vis.js가 자동으로 처리하므로 불필요한 initPositions 제거
window.addEventListener('resize', () => {
  if (visNetwork) {
    // QA: Vis.js가 자동으로 리사이즈 처리, redraw()로 강제 갱신
    try {
      visNetwork.redraw();
    } catch (e) {
      console.warn('Resize redraw failed:', e);
      // 폴백: 전체 재렌더링
      renderGraph();
    }
  }
});

// UX: 로고 클릭 시 홈으로 이동
function resetToHome() {
  // 검색 초기화
  const searchInput = document.getElementById('nodeSearch');
  if (searchInput) {
    searchInput.value = '';
    hideSearchResults();
    clearSearchHighlight();
  }
  
  // 선택 노드 초기화
  selectedNode = null;
  selectedNodeId = null; // CTO: UX 패턴 - 선택 해제
  connectedNodeIds.clear(); // CTO: 연결 노드 초기화
  
  // 필터 초기화 (모든 타입 활성화)
  activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.add('active');
  });
  
  // 그래프 재렌더링
  renderGraph();
  
  // 전체 뷰로 fit
  if (visNetwork) {
    visNetwork.unselectAll();
    visNetwork.fit({ animation: { duration: 300 } });
  }
  
  // 우측 패널 빈 상태로
  showEmptyPanel();
  
  // 상태 메시지 업데이트
  updateStatus('홈으로 이동했습니다', true);
}

// CTO: Vis.js 라이브러리 로드 확인 후 loadGraph 실행 (초기화)
function waitForVisJs(maxAttempts = 20, interval = 100) {
  if (typeof vis !== 'undefined' && vis.Network) {
    loadGraph();
    // UX: 검색 및 로고 이벤트 설정
    setupSearch();
    setupLogoHome();
    return;
  }
  if (maxAttempts <= 0) {
    console.error('Vis.js failed to load after timeout');
    updateStatus('Vis.js 라이브러리 로드 실패 - 페이지를 새로고침해주세요', false);
    hideGraphLoading();
    // Vis.js 실패해도 검색/로고는 설정
    setupSearch();
    setupLogoHome();
    return;
  }
  setTimeout(() => waitForVisJs(maxAttempts - 1, interval), interval);
}

function setupLogoHome() {
  const logoHome = document.getElementById('logoHome');
  if (logoHome) {
    logoHome.addEventListener('click', resetToHome);
    logoHome.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        resetToHome();
      }
    });
  }
}

// DOM 로드 후 Vis.js 확인
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => waitForVisJs());
} else {
  waitForVisJs();
}
