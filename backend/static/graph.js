/* ═══════════════════════════════════════════════════════════════════════════
   모듈 구성 (비개발자용)
   ─────────────────────────────────────────────────────────────────────────
   [설정] CONFIG    서버 주소, 노드 타입, 레이아웃/색상/문구 (한 곳만 수정)
   [데이터] STATE   현재 그래프 노드·엣지·선택 상태·캐시
   [통신] API       서버 요청 (그래프 로드, 노드 상세, 지배구조 맵)
   [배치] LAYOUT    노드 위치 계산 (서버 레이아웃 또는 클라이언트)
   [지배구조맵] GOV MAP  히트맵·Ego 뷰 전환
   [그리기] RENDER  화면에 그래프 그리기 (Vis.js)
   [패널] PANEL     노드 클릭 시 우측 상세·연결노드·탭
   [채팅] CHAT      AI 질문 연동 (Streamlit 연동)
   [시작] INIT      페이지 로드 시 이벤트 연결·첫 데이터 로드
   ─────────────────────────────────────────────────────────────────────────
   개발: CONFIG → STATE → API → LAYOUT → RENDER / GOV MAP → PANEL / CHAT → INIT
══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════ */
// file:// 로 열면 hostname이 비어 있어 연결 실패하므로, 로컬은 항상 localhost:8000 사용
const API_BASE =
  window.GRAPHIQ_API_BASE ||
  (!window.location.hostname ||
  window.location.protocol === "file:" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : `${window.location.protocol}//${window.location.hostname}:8000`);

// 그래프 API limit·노드 타입 (확장 시 이곳만 수정)
// Vis.js 단일 렌더링 엔진.
const GRAPH_CONFIG = {
  limits: { nodes: 500, edges: 200, nodesFallback: 50 },
  nodeTypes: ["company", "person", "major", "institution"],
  minRatio: 5, // 초기 로딩 시 N% 미만 지분 제외 (노이즈·뭉침 감소)
  useServerLayout: true, // 서버 레이아웃 사용, 실패 시 클라이언트 force 폴백
  layoutEngine: "pygraphviz", // PyGraphviz(neato) → 실패 시 NetworkX
  openEgoOnNodeClick: false, // 노드 클릭 시 포커스+상세만; true면 지배구조 맵 전체 화면
};

// P2: 운영 설정 상수화 (타임아웃, API 제한 등)
const API_CONFIG = {
  timeout: 30000, // API 요청 타임아웃 (ms)
  retryDelay: 1000, // 재시도 지연 (ms)
};

// 노드 전환·홈 복귀 시 레이아웃 복구용 상수.
const UX_CONFIG = {
  zoomHandlerSkipMsAfterSelect: 400, // 선택 직후 이 시간(ms) 동안 zoom 핸들러에서 renderGraph 스킵
};

/** 노드 상세 패널 연결 노드 표시 상한 (서버 LIMIT 20과 동일) */
const NODE_DETAIL_RELATED_MAX = 20;

const EGO_GRAPH_CONFIG = {
  MAX_HOPS: 2,
  MAX_NODES: 120,
  initialViewAfterLoad: "fit", // 'fit': 전체 맞춤, 'focus': 해당 노드 줌
};

// UI 문구 단일 소스 (i18n 준비).
const UI_STRINGS = {
  nodeType: {
    company: "회사",
    person: "개인주주",
    major: "최대주주",
    institution: "기관",
  },
  heatmap: {
    title: "가중치 엣지 히트맵 (지분율 %)",
    sub: "행 → 열: 주주 → 회사 지분",
    ariaLabel: "지분율 행렬",
  },
  govMap: {
    label: "지배구조 맵",
    viewHeatmap: "지배구조 맵 (가중치 히트맵)",
    viewEgo: "지배구조 맵 · Ego",
    btnHeatmap: "히트맵",
    btnEgo: "Ego 그래프",
    btnExit: "전체 그래프로 돌아가기",
    titleHeatmap: "가중치(지분율) 행렬로 보기",
    titleEgo: "노드-링크 그래프로 보기",
    statusEgoLoaded: "이 노드 기준 지배구조 맵을 표시합니다",
  },
  nodeDetail: {
    sectionRelated: "연결 노드",
    sectionAttrs: "속성",
    more: "더보기",
    fold: "접기",
    btnEgoMap: "이 노드 기준 지배구조 맵 보기",
    btnAskAi: "이 노드에 대해 AI에게 질문하기",
  },
  legend: {
    title: "노드 유형",
    countSuffix: " 건",
  },
  filter: {
    minOneType: "최소 하나의 노드 타입을 선택해주세요",
  },
  tabs: {
    detail: "노드 상세",
    chat: "AI 질문",
  },
  panelEmpty: {
    title: "그래프에서 노드를 클릭하면",
    titleBr: "상세 정보를 확인할 수 있습니다",
    hint: "노드를 드래그하여 그래프를 탐색하세요",
  },
};

// 에러 메시지 단일 소스.
const ERROR_MESSAGES = {
  EGO_GRAPH_LOAD_FAILED: "지배구조 맵을 불러올 수 없습니다",
  EGO_GRAPH_NODE_NOT_FOUND: "해당 노드를 찾을 수 없거나 연결된 노드가 없습니다.",
  EGO_GRAPH_DATA_MISSING: "지배구조 맵 데이터 없음",
  EGO_GRAPH_DATA_ERROR: "지배구조 맵 데이터 오류",
  EGO_GRAPH_NO_NODES: "지배구조 맵 노드 없음",
  EGO_GRAPH_LOAD_FAILED_STATUS: "지배구조 맵 로드 실패",
};

// 레이아웃 정책: ratio(지분%) → 시각적 거리. "높은 지분 = 가까이".
// Force: 초기 배치+물리로 퍼뜨림. 격자만 쓰면 뭉침.
// 초기 뷰 제한: 대량 노드 시 가독성·밀집 완화.
const INITIAL_VIEW_CONFIG = {
  enabled: true,
  applyWhenOver: 280,
  minConnections: 3,
  minRatio: 5,
  showTypes: ["company", "major", "institution"],
  maxNodes: 380,
};

/**
 * 초기 뷰/전체 그래프 표시 노드 제한.
 * @param {Array} nodes - 필터 적용 전 노드 배열 (NODES)
 * @param {Array} edges - 엣지 배열 (EDGES)
 * @param {Set} typeFilterSet - 활성 노드 타입 (activeFilters)
 * @returns {{ visibleNodes: Array, didApplyLimit: boolean }}
 */
function computeVisibleNodesForRender(nodes, edges, typeFilterSet) {
  const visible = (nodes || []).filter(
    (n) => n && typeFilterSet.has(canonicalNodeType(n.type)),
  );
  const threshold = INITIAL_VIEW_CONFIG.applyWhenOver ?? INITIAL_VIEW_CONFIG.maxNodes;
  const applyLimit =
    INITIAL_VIEW_CONFIG.enabled && visible.length > threshold;
  if (!applyLimit) return { visibleNodes: visible, didApplyLimit: false };

  const filtered = visible.filter((n) => {
    const ct = canonicalNodeType(n.type);
    if (!INITIAL_VIEW_CONFIG.showTypes.includes(ct)) return false;
    const nodeEdges = (edges || []).filter((e) => e.from === n.id || e.to === n.id);
    const degree = nodeEdges.length;
    const maxRatio = Math.max(...nodeEdges.map((e) => Number(e.ratio || 0)), 0);
    if (degree < INITIAL_VIEW_CONFIG.minConnections) return false;
    if (maxRatio < INITIAL_VIEW_CONFIG.minRatio && ct === "person") return false;
    return true;
  });

  const cap = INITIAL_VIEW_CONFIG.maxNodes;
  if (filtered.length <= cap) return { visibleNodes: filtered, didApplyLimit: true };
  const limited = filtered
    .map((n) => {
      const nodeEdges = (edges || []).filter((e) => e.from === n.id || e.to === n.id);
      const degree = nodeEdges.length;
      const maxRatio = Math.max(...nodeEdges.map((e) => Number(e.ratio || 0)), 0);
      return { node: n, importance: degree * 0.1 + maxRatio * 0.05 };
    })
    .sort((a, b) => b.importance - a.importance)
    .slice(0, cap)
    .map((item) => item.node);
  return { visibleNodes: limited, didApplyLimit: true };
}

/** 노드 타입 대소문자 정규화 (필터 일관성). */
function canonicalNodeType(t) {
  return (t && String(t).toLowerCase()) || "";
}

const LAYOUT_CONFIG = {
  force: {
    gravity: 0,
    minDist: 800,
    repulsionRange: 6.0,
    repulsionStrength: 600,
    collisionRadiusMultiplier: 8.0,
    layoutRadiusMultiplier: 5,
    idealDistMin: 800,
    idealDistMax: 2000,
    idealDistDegreeFactor: 0.2,
    useInverseSqrtEdgeLength: true,
    idealDistBaseLengthForInverseSqrt: 2000,
    repulsionDegreeFactor: 0.5,
    edgeForce: 0.022, // 약화: 링크가 컴포넌트 중심으로 당기는 힘 감소 (스스로 퍼짐)
    maxIter: 1200, // 반발 워밍업 + 본 시뮬 여유 (대량 노드 시 initPositions에서 effectiveMaxIter로 축소)
    repulsionOnlyIter: 300, // UX: 반발 워밍업 확대 (250→300)
    padding: 100,
    useFullArea: true,
    damping: 0.82, // 약간 상향: 튕김 완화하면서도 수렴
    packComponents: true,
    expansionFromCenter: 0.04, // 무게중심에서 바깥으로 밀어내기 강화
  },
  ego: {
    padding: 70,
    minNodeSpacing: 58,
    subRowHeight: 46,
    // Vis.js 계층형 레이아웃 (지배구조 맵). physics: false와 함께 사용.
    hierarchical: {
      direction: "UD",
      sortMethod: "directed",
      nodeSpacing: 150,
    },
  },
};

// 노드 색상 정의: active/closed 상태별 색상
const NODE_COLORS = {
  company: { active: "#d85604", closed: "#999999" }, // 주황 / 회색
  person: { active: "#ad1b02", closed: "#666666" }, // 빨강 / 어두운 회색
  major: { active: "#e88d14", closed: "#888888" }, // 호박색 / 회색
  institution: { active: "#7c5cfc", closed: "#777777" }, // 보라 / 회색
};

// 노드 색상 가져오기 헬퍼 함수
function getNodeColor(node) {
  const typeColors = NODE_COLORS[node.type] || {
    active: "#999999",
    closed: "#666666",
  };
  // active가 false이거나 undefined이면 closed 색상 사용
  const isActive = node.active !== false; // 기본값은 true (active)
  return isActive ? typeColors.active : typeColors.closed;
}

/** 노드 채우기 색상 (범례 연한 버전). */
function getNodeFillColor(hexColor, opacity = 0.15) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return `rgba(255, 255, 255, ${opacity})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/** 헥스 → RGB. */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/** 엣지 라벨 포맷 (다양한 형식 안전 처리). */
function formatEdgeLabel(edges) {
  const safeNumber = (val) => {
    if (val == null || val === "") return 0;
    if (typeof val === "string") {
      const cleaned = val.toString().replace(/[^\d.]/g, "");
      const num = parseFloat(cleaned);
      return Number.isNaN(num) ? 0 : num;
    }
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  };

  const ratios = edges.map((ed) => safeNumber(ed.ratio));
  const maxRatio = Math.max(...ratios, 0);
  const ratio = Math.max(0, Math.min(100, maxRatio));
  const relCount = edges.reduce((sum, ed) => {
    const count = safeNumber(ed.count);
    return sum + (count > 0 ? count : 1);
  }, 0);
  if (ratio === 0 && relCount > 0) return relCount > 5 ? `${relCount}건` : "";
  if (relCount > 1) {
    return `${ratio.toFixed(1)}% (${relCount}건)`;
  }

  return `${ratio.toFixed(1)}%`;
}
const NODE_RADIUS = { company: 22, person: 16, major: 20, institution: 18 };

/** 노드 크기 (연결 수·지분율 반영). */
function calculateNodeSize(node, edges, selectedNodeId, connectedNodeIds) {
  const baseRadius = NODE_RADIUS[node.type] || 18;
  const baseSize = baseRadius * 2;
  const nodeEdges = edges.filter((e) => e.from === node.id || e.to === node.id);
  const degree = nodeEdges.length;
  if (!window._avgDegree || !window._maxDegree) {
    const allDegrees = NODES.map(
      (n) => EDGES.filter((e) => e.from === n.id || e.to === n.id).length,
    );
    window._avgDegree =
      allDegrees.reduce((a, b) => a + b, 0) / Math.max(allDegrees.length, 1);
    window._maxDegree = Math.max(...allDegrees, 1);
  }
  const avgDegree = window._avgDegree;
  const maxDegree = window._maxDegree;

  let degreeFactor = 1.0;
  if (degree >= maxDegree * 0.7) degreeFactor = 1.3;
  else if (degree >= avgDegree * 1.5) degreeFactor = 1.2;
  else if (degree >= avgDegree) degreeFactor = 1.1;
  else if (degree < avgDegree * 0.5 && degree > 0) degreeFactor = 0.9;
  else if (degree === 0) degreeFactor = 0.85;

  let ratioFactor = 1.0;
  if (nodeEdges.length > 0) {
    const maxRatio = Math.max(...nodeEdges.map((e) => Number(e.ratio || 0)));
    if (maxRatio > 20) {
      ratioFactor = 1.15; // 20% 이상 지분: +15%
    } else if (maxRatio > 10) {
      ratioFactor = 1.08; // 10% 이상 지분: +8%
    } else if (maxRatio > 5) {
      ratioFactor = 1.04; // 5% 이상 지분: +4%
    }
  }

  const isSelected = nodeIdsEqual(selectedNodeId, node.id);
  const isConnected = selectedNodeId ? connectedNodeIds.has(String(node.id)) : false;
  let stateFactor = 1.0;
  if (isSelected) stateFactor = 1.2;
  else if (!isConnected && selectedNodeId) stateFactor = 0.7;
  const finalSize = baseSize * degreeFactor * ratioFactor * stateFactor;
  const minSize = Math.max(16, baseSize * 0.6);
  const maxSize = Math.min(80, baseSize * 1.8);
  return Math.max(minSize, Math.min(maxSize, finalSize));
}

/** 레이아웃 반지름: 원+라벨 포함. 충돌/반발/fitToView용. */
function getLayoutRadius(nodeOrType) {
  const type = typeof nodeOrType === "object" ? nodeOrType?.type : nodeOrType;
  const base = NODE_RADIUS[type] || 18;
  const mult = LAYOUT_CONFIG.force.layoutRadiusMultiplier ?? 3;
  const lc = LABEL_CONFIG;
  const labelHeight = 16;
  const verticalExtent = base + (lc.labelGap || 18) + labelHeight; // 원 아래 라벨까지 세로 반경

  if (typeof nodeOrType === "object") {
    const labelText = (nodeOrType.label ?? nodeOrType.name ?? "").toString();
    const labelHalf = labelText.length * (lc.pxPerChar || 8) * 0.5;
    const horizontalRadius = Math.max(base, base + labelHalf);
    const withLabel = Math.max(horizontalRadius, verticalExtent);
    return Math.max(base * mult, withLabel);
  }
  return Math.max(base * mult, verticalExtent);
}

// 노드 라벨: 노드 외부(하단) 전용, 겹침 회피 파라미터
const LABEL_CONFIG = {
  maxLength: 28, // 비선택 시 표시 최대 글자 수 (말줄임)
  maxLengthSelected: 36, // 선택 시
  pxPerChar: 8, // 한글 등 폭 추정 (px/자)
  labelGap: 18, // 노드 가장자리 ~ 라벨 세로 간격
  minLabelSpacingY: 6, // 라벨 간 최소 세로 간격
  minLabelSpacingX: 4, // 라벨 간 최소 가로 간격 (겹치면 가로 시프트)
  maxLabelDropFromNode: 120, // 겹침 회피로 밀 때, 노드 기준 자연 위치에서 최대 Npx 아래까지만 (라벨-노드 분리 방지)
  fontSize: 11,
  fontSizeSelected: 13,
};

/** 지분율 0~100 clamp. */
function formatRatio(val) {
  if (val == null || val === "") return "";
  const n = Number(val);
  if (Number.isNaN(n)) return "";
  return Math.min(100, Math.max(0, n));
}

/** CSS 변수에서 색상 읽기. */
function getThemeColor(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(
    "--" + name,
  );
  if (v) return v.trim();
  const fallbacks = {
    "edge-stroke": "#8b7d6f",
    "pwc-orange": "#d85604",
    "surface-tint": "#fff4ed",
    "surface-overlay": "rgba(249,247,245,.9)",
    "border-tint": "#fbc99a",
    border: "#e8e2db",
    "text-3": "#a8998a",
  };
  return fallbacks[name] || "";
}

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let NODES = [];
let EDGES = [];
let positions = {};
let selectedNode = null;
let activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
let nodeCounts = Object.fromEntries(GRAPH_CONFIG.nodeTypes.map((t) => [t, 0])); // 노드 타입별 개수
let chatContext = null;
let nodeDetailCache = {};
let isEgoMode = false;
let egoCenterId = null;
const GOVERNANCE_MAP_VIEW = { HEATMAP: "heatmap", EGO: "ego" };
let egoMapViewMode = GOVERNANCE_MAP_VIEW.EGO;

const GOV_MAP_CONFIG = { heatmapEnabled: false };

/** 지배구조 맵 DOM ID (HTML과 일치) */
const GOV_MAP_IDS = {
  wrap: "egoHeatmapWrap",
  banner: "egoBanner",
  bannerLabel: "egoBannerLabel",
  btnHeatmap: "egoViewHeatmapBtn",
  btnEgo: "egoViewEgoBtn",
};
let selectedNodeId = null;
let connectedNodeIds = new Set();
let lastNodeSelectionTime = 0; // 선택 직후 zoom 핸들러에서 renderGraph 스킵

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
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      throw new Error(
        "요청 시간이 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.",
      );
    }
    if (
      e.message.includes("Failed to fetch") ||
      e.message.includes("NetworkError")
    ) {
      throw new Error(
        "Backend 서버에 연결할 수 없습니다. Backend가 실행 중인지 확인하세요.",
      );
    }
    console.error("API Error:", e);
    throw e;
  }
}

// "전체 그래프로 돌아가기" — 로고 클릭(ego 시)과 동일 완료 동작
function exitEgoMode() {
  isEgoMode = false;
  egoCenterId = null;
  const banner = document.getElementById(GOV_MAP_IDS.banner);
  if (banner) banner.classList.add("util-hidden");
  document.getElementById(GOV_MAP_IDS.wrap)?.classList.add("util-hidden");
  document.getElementById("visNetwork")?.classList.remove("util-hidden");
  selectedNode = null;
  selectedNodeId = null;
  connectedNodeIds.clear();
  loadGraph().then(() => {
    if (visNetwork) {
      visNetwork.unselectAll();
      let fitDone = false;
      const doFit = () => {
        if (fitDone || !visNetwork) return;
        fitDone = true;
        try {
          visNetwork.fit({ animation: { duration: 300 } });
        } catch (e) {
          console.warn("exitEgoMode fit failed:", e);
        }
      };
      visNetwork.once("stabilizationIterationsDone", doFit);
      setTimeout(doFit, 550);
    }
    showEmptyPanel(true); // 재렌더 생략 (loadGraph 내 이미 renderGraph 완료)
    updateStatus("전체 그래프로 돌아갔습니다", true);
  });
}

/** 서버 레이아웃 API. 0~1 좌표 → 뷰포트 픽셀. ratio → 시각적 거리. */
async function fetchServerLayout(nodes, edges, viewportW, viewportH) {
  const pad = LAYOUT_CONFIG.force.padding;
  const innerW = Math.max(1, viewportW - 2 * pad);
  const innerH = Math.max(1, viewportH - 2 * pad);
  const engine = GRAPH_CONFIG.layoutEngine || "networkx";
  const body = {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      ratio: Math.max(0.1, Math.min(100, e.ratio || 0)),
    })),
    width: 1,
    height: 1,
    padding: 0.05,
    use_components: true,
    engine: engine,
  };
  const res = await apiCall("/api/v1/graph/layout", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res || !res.positions) return null;
  const out = {};
  for (const [id, p] of Object.entries(res.positions)) {
    if (p && typeof p.x === "number" && typeof p.y === "number") {
      out[id] = { x: pad + p.x * innerW, y: pad + p.y * innerH };
    }
  }
  return out;
}

async function loadEgoGraph(nodeId) {
  // catch 블록에서도 사용하도록 상수로 저장
  const targetNodeId = nodeId;
  
  try {
    isEgoMode = true;
    egoCenterId = targetNodeId;
    // 메시지 일관성
    showGraphLoading(
      LOADING_MESSAGES.loadingEgo,
      LOADING_GUIDANCE.loadingEgo,
      null,
      0,
    );
    const res = await apiCall(
      `/api/v1/graph/ego?node_id=${encodeURIComponent(targetNodeId)}&max_hops=${EGO_GRAPH_CONFIG.MAX_HOPS}&max_nodes=${EGO_GRAPH_CONFIG.MAX_NODES}`,
    );
    if (!res || !res.nodes || !res.edges) {
      updateStatus(ERROR_MESSAGES.EGO_GRAPH_DATA_MISSING, false);
      hideGraphLoading();
      isEgoMode = false;
      return;
    }
    
    // ego_id 검증
    if (!res.ego_id) {
      console.error("Ego graph response missing ego_id:", res);
      updateStatus(ERROR_MESSAGES.EGO_GRAPH_DATA_ERROR, false);
      hideGraphLoading();
      isEgoMode = false;
      return;
    }
    
    NODES = res.nodes;
    EDGES = res.edges;
    activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
    positions = {};
    egoMapViewMode = GOV_MAP_CONFIG.heatmapEnabled ? GOVERNANCE_MAP_VIEW.HEATMAP : GOVERNANCE_MAP_VIEW.EGO;

    const egoNode = NODES.find((n) => n.id === res.ego_id);
    if (!egoNode && NODES.length === 0) {
      updateStatus(ERROR_MESSAGES.EGO_GRAPH_NO_NODES, false);
      hideGraphLoading();
      isEgoMode = false;
      return;
    }
    // 지배구조 맵: Vis.js hierarchical 레이아웃 사용 (positions 미사용)
    updateStatus(UI_STRINGS.govMap.statusEgoLoaded, true);
    hideGraphLoading();
    selectedNode = NODES.find((n) => n.id === res.ego_id) || null;
    selectedNodeId = res.ego_id;
    if (selectedNode) {
      switchTabById("detail");
      renderNodeDetailFallback(selectedNode);
      const requestedNodeId = selectedNode.id;
      const detail = await loadNodeDetail(selectedNode.id);
      if (detail && nodeIdsEqual(selectedNodeId, requestedNodeId)) renderNodeDetail(detail);
      else if (!detail) updateNodeDetailLoadingMessage(LOADING_MESSAGES.nodeDetailLoadError);
    }
    const banner = document.getElementById(GOV_MAP_IDS.banner);
    if (banner) {
      banner.classList.remove("util-hidden");
      const exitBtn = banner.querySelector(".ego-exit-btn");
      if (exitBtn) exitBtn.onclick = exitEgoMode;
      const heatBtn = document.getElementById(GOV_MAP_IDS.btnHeatmap);
      const egoBtn = document.getElementById(GOV_MAP_IDS.btnEgo);
      if (heatBtn) {
        heatBtn.classList.toggle("util-hidden", !GOV_MAP_CONFIG.heatmapEnabled);
        if (GOV_MAP_CONFIG.heatmapEnabled && !heatBtn._bound) {
          heatBtn._bound = true;
          heatBtn.addEventListener("click", showGovernanceMapHeatmapView);
        }
      }
      if (egoBtn && !egoBtn._bound) {
        egoBtn._bound = true;
        egoBtn.addEventListener("click", showGovernanceMapEgoView);
      }
    }
    setGovernanceMapViewMode(egoMapViewMode);
    // fit: 전체 맞춤, focus: 해당 노드 줌
    if (egoMapViewMode === GOVERNANCE_MAP_VIEW.EGO && visNetwork) {
      const viewBehavior = EGO_GRAPH_CONFIG.initialViewAfterLoad || "fit";
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            if (viewBehavior === "fit") {
              visNetwork.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
            } else {
              focusOnNode(res.ego_id);
            }
          } catch (e) {
            console.warn("Ego initial view failed:", e);
          }
        }, 150);
      });
    }
  } catch (e) {
    isEgoMode = false;
    egoCenterId = null;
    const banner = document.getElementById(GOV_MAP_IDS.banner);
    if (banner) banner.classList.add("util-hidden");
    updateStatus(ERROR_MESSAGES.EGO_GRAPH_LOAD_FAILED_STATUS, false, ERROR_CODES.NEO4J_CONNECTION_FAILED);
    hideGraphLoading();
    console.error("loadEgoGraph failed:", e);
    
    // 에러 타입별 인라인 메시지
    const errorType = classifyError(e);
    const errorMessage = e.message || "알 수 없는 오류가 발생했습니다";
    
    if (errorType === ERROR_CODES.NETWORK_ERROR || errorType === ERROR_CODES.BACKEND_CONNECTION_FAILED) {
      // 네트워크/서버 연결 오류는 showConnectionError 사용
      showConnectionError(e);
    } else {
      // 404 및 기타 에러는 노드 상세 패널에 인라인 메시지 표시
      showEgoGraphError(
        errorMessage.includes("404") || errorMessage.includes("찾을 수 없")
          ? "NOT_FOUND"
          : "UNKNOWN",
        errorMessage,
        targetNodeId,
      );
    }
  }
}

/* ═══════════════════════════════════════════
   GOVERNANCE MAP VIEW (Heatmap / Ego)
   단일 데이터 소스(ego API) → 뷰 모드에 따라 Heatmap 또는 Ego 그래프 렌더.
   전환 시 재렌더만 하면 되도록 모듈화.
═══════════════════════════════════════════ */

/** 가중치 엣지 행렬 생성: from×to, 값은 지분율(%). */
function buildWeightedEdgeMatrix(nodes, edges) {
  if (!nodes?.length) return { nodeIds: [], labels: [], matrix: [] };
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const orderIds = [].concat(nodes.map((n) => n.id));
  orderIds.sort((a, b) => {
    const la = (idToNode.get(a)?.label || a).toString();
    const lb = (idToNode.get(b)?.label || b).toString();
    return la.localeCompare(lb, "ko");
  });
  const n = orderIds.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  const edgeMap = new Map();
  edges.forEach((e) => {
    const key = `${e.from}\t${e.to}`;
    const val = Number(e.ratio) || 0;
    if (!edgeMap.has(key) || edgeMap.get(key) < val) edgeMap.set(key, val);
  });
  const idx = new Map(orderIds.map((id, i) => [id, i]));
  edges.forEach((e) => {
    const i = idx.get(e.from);
    const j = idx.get(e.to);
    if (i != null && j != null) matrix[i][j] = Number(e.ratio) || 0;
  });
  const labels = orderIds.map((id) => (idToNode.get(id)?.label || id).toString());
  return { nodeIds: orderIds, labels, matrix };
}

/** 0~100 값을 브랜드 색상 그라데이션으로 반환 (가독성). */
function heatmapColorForRatio(ratio) {
  if (ratio <= 0) return "#f5f5f5";
  const t = Math.min(1, ratio / 100);
  const r = Math.round(245 - t * 169);
  const g = Math.round(86 + t * 69);
  const b = Math.round(4 + t * 0);
  return `rgb(${r},${g},${b})`;
}

/** 가중치 엣지 히트맵 렌더 (동일 영역에서 Ego 그래프와 전환 가능). */
function renderWeightedEdgeHeatmap(egoId, nodes, edges) {
  const wrap = document.getElementById(GOV_MAP_IDS.wrap);
  if (!wrap) return;
  const { nodeIds, labels, matrix } = buildWeightedEdgeMatrix(nodes, edges);

  const { title: heatmapTitle, sub: heatmapSub, ariaLabel: heatmapAria } = UI_STRINGS.heatmap;
  let html = `
    <div class="heatmap-header">
      <span class="heatmap-title">${heatmapTitle}</span>
      <span class="heatmap-sub">${heatmapSub}</span>
    </div>
    <div class="heatmap-scroll">
      <table class="heatmap-table" role="grid" aria-label="${heatmapAria}">
        <thead>
          <tr><th class="heatmap-corner"></th>`;
  nodeIds.forEach((id, j) => {
    const short = String(labels[j]).slice(0, 12);
    const isEgo = id === egoId;
    html += `<th class="heatmap-th ${isEgo ? "heatmap-ego" : ""}" title="${esc(labels[j])}">${esc(short)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  nodeIds.forEach((id, i) => {
    const isEgo = id === egoId;
    html += `<tr><td class="heatmap-row-label ${isEgo ? "heatmap-ego" : ""}" title="${esc(labels[i])}">${esc(String(labels[i]).slice(0, 14))}</td>`;
    nodeIds.forEach((idJ, j) => {
      const v = matrix[i][j];
      const color = heatmapColorForRatio(v);
      const text = v > 0 ? (v % 1 === 0 ? String(v) : v.toFixed(1)) : "";
      const cellTitle = `${String(labels[i]).replace(/"/g, "&quot;")} → ${String(labels[j]).replace(/"/g, "&quot;")}: ${text}%`;
      html += `<td class="heatmap-cell" style="background:${color}" title="${cellTitle}">${text}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  wrap.innerHTML = html;
}

/** 지배구조 맵 뷰 모드 설정 후 현재 모드에 맞게 렌더 (Ego 데이터는 이미 NODES/EDGES에 있음). */
function setGovernanceMapViewMode(mode) {
  if (mode === GOVERNANCE_MAP_VIEW.HEATMAP && !GOV_MAP_CONFIG.heatmapEnabled) mode = GOVERNANCE_MAP_VIEW.EGO;
  egoMapViewMode = mode;
  if (!isEgoMode || !egoCenterId) return;
  const heatWrap = document.getElementById(GOV_MAP_IDS.wrap);
  const visEl = document.getElementById("visNetwork");
  const labelEl = document.getElementById(GOV_MAP_IDS.bannerLabel);
  if (mode === GOVERNANCE_MAP_VIEW.HEATMAP) {
    if (visEl) visEl.classList.add("util-hidden");
    if (heatWrap) {
      heatWrap.classList.remove("util-hidden");
      renderWeightedEdgeHeatmap(egoCenterId, NODES, EDGES);
    }
    if (labelEl) labelEl.textContent = UI_STRINGS.govMap.viewHeatmap;
  } else {
    if (heatWrap) heatWrap.classList.add("util-hidden");
    if (visEl) visEl.classList.remove("util-hidden");
    renderGraph();
    if (labelEl) labelEl.textContent = UI_STRINGS.govMap.viewEgo;
  }
  updateEgoBannerViewButtons();
}

function updateEgoBannerViewButtons() {
  const heatBtn = document.getElementById(GOV_MAP_IDS.btnHeatmap);
  const egoBtn = document.getElementById(GOV_MAP_IDS.btnEgo);
  if (heatBtn) {
    heatBtn.classList.toggle("util-hidden", !GOV_MAP_CONFIG.heatmapEnabled);
    if (GOV_MAP_CONFIG.heatmapEnabled) {
      heatBtn.classList.toggle("active", egoMapViewMode === GOVERNANCE_MAP_VIEW.HEATMAP);
      heatBtn.setAttribute("aria-pressed", egoMapViewMode === GOVERNANCE_MAP_VIEW.HEATMAP);
    }
  }
  if (egoBtn) {
    egoBtn.classList.toggle("active", egoMapViewMode === GOVERNANCE_MAP_VIEW.EGO);
    egoBtn.setAttribute("aria-pressed", egoMapViewMode === GOVERNANCE_MAP_VIEW.EGO);
  }
}

function showGovernanceMapHeatmapView() {
  if (!GOV_MAP_CONFIG.heatmapEnabled) return;
  setGovernanceMapViewMode(GOVERNANCE_MAP_VIEW.HEATMAP);
}

function showGovernanceMapEgoView() {
  setGovernanceMapViewMode(GOVERNANCE_MAP_VIEW.EGO);
}

// DOM 준비 확인
function ensureDOMReady() {
  return new Promise((resolve) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve);
    } else if (
      document.readyState === "interactive" ||
      document.readyState === "complete"
    ) {
      resolve();
    } else {
      // 안전장치: 최대 5초 대기
      setTimeout(resolve, 5000);
    }
  });
}

async function loadGraph() {
  try {
    // 전체 그래프 진입 시 제한 알림 리셋
    window._initialViewNotified = false;
    // 전체 그래프 진입 시 physics 재활성화 억제
    window._loadGraphRendering = true;

    // DOM 준비 확인
    await ensureDOMReady();

    // 컨테이너 존재 확인
    const container = document.getElementById("visNetwork");
    if (!container) {
      console.error("초기화 시점에 visNetwork 컨테이너를 찾을 수 없습니다:", {
        readyState: document.readyState,
        graphAreaExists: !!document.getElementById("graphArea"),
        allIds: Array.from(document.querySelectorAll("[id]"))
          .slice(0, 20)
          .map((el) => el.id),
      });
      updateStatus(
        "그래프 영역 초기화 실패 - 페이지를 새로고침해주세요",
        false,
      );
      return;
    }

    isEgoMode = false;
    egoCenterId = null;
    const banner = document.getElementById(GOV_MAP_IDS.banner);
    if (banner) banner.classList.add("util-hidden");
    updateStatus("데이터 로딩 중...", false);
    // 메시지 일관성
    showGraphLoading(
      LOADING_MESSAGES.connecting,
      LOADING_GUIDANCE.connecting,
      null,
      0,
    );

    // 먼저 Backend 프로세스 라이브니스만 확인 (Neo4j 실패와 구분)
    retryCount = 0; // 재시도 카운터 리셋
    try {
      await apiCall("/ping");
    } catch (e) {
      updateStatus("서버 연결 실패", false, ERROR_CODES.BACKEND_CONNECTION_FAILED);
      console.error("Backend ping failed:", e);
      hideGraphLoading();
      showConnectionError(e);
      return;
    }
    // 시간 안내 ("최대 1분")
    showGraphLoading(
      "그래프 데이터 불러오는 중…",
      "데이터가 많으면 최대 1분까지 걸릴 수 있습니다",
      25,
      1,
    );

    // 노드 개수 조회 및 필터 업데이트
    try {
      const countsRes = await apiCall("/api/v1/graph/node-counts");
      if (countsRes) {
        nodeCounts = countsRes;
        updateFilterCounts();
      }
    } catch (e) {
      console.warn("Failed to load node counts:", e);
      // 개수 조회 실패해도 계속 진행
    }

    // 엣지를 먼저 로드하여 연결된 노드 ID 수집
    let edgesRes;
    try {
      const minR = GRAPH_CONFIG.minRatio != null ? GRAPH_CONFIG.minRatio : "";
      edgesRes = await apiCall(
        `/api/v1/graph/edges?limit=${GRAPH_CONFIG.limits.edges}${minR !== "" ? `&min_ratio=${minR}` : ""}`,
      );
    } catch (e) {
      updateStatus("데이터 로드 실패", false);
      console.error("Failed to load edges:", e);
      hideGraphLoading();
      if (e.message && e.message.includes("503")) showServiceUnavailable();
      else showConnectionError();
      return;
    }
    // 메시지 일관성
    showGraphLoading(
      LOADING_MESSAGES.loadingNodes,
      LOADING_GUIDANCE.loadingNodes,
      50,
      1,
    );

    // 빈 응답 처리 강화
    EDGES = (edgesRes?.edges || []).filter((e) => e && e.from && e.to);

    // 엣지가 참조하는 모든 노드 ID 수집
    const requiredNodeIds = new Set();
    EDGES.forEach((e) => {
      requiredNodeIds.add(e.from);
      requiredNodeIds.add(e.to);
    });

    // 연결된 노드만 조회 (엣지가 참조하는 노드들)
    let nodesRes;
    try {
      if (requiredNodeIds.size > 0) {
        // 노드 ID 목록을 쿼리 파라미터로 전달
        const nodeIdsParam = Array.from(requiredNodeIds).join(",");
        nodesRes = await apiCall(
          `/api/v1/graph/nodes?limit=${GRAPH_CONFIG.limits.nodes}&node_ids=${encodeURIComponent(nodeIdsParam)}`,
        );
      } else {
        // 엣지가 없으면 기본 limit으로 노드만 로드
        nodesRes = await apiCall(
          `/api/v1/graph/nodes?limit=${GRAPH_CONFIG.limits.nodesFallback}`,
        );
      }
    } catch (e) {
      updateStatus("노드 로드 실패", false);
      console.error("Failed to load nodes:", e);
      hideGraphLoading();
      if (e.message && e.message.includes("503")) showServiceUnavailable();
      else showConnectionError();
      return;
    }

    // 빈 응답 처리 강화
    NODES = (nodesRes?.nodes || []).filter((n) => n && n.id);

    // 엣지가 참조하는 노드가 모두 로드되었는지 확인
    const loadedNodeIds = new Set(NODES.map((n) => n.id));
    const missingNodeIds = new Set();
    EDGES.forEach((e) => {
      if (!loadedNodeIds.has(e.from)) missingNodeIds.add(e.from);
      if (!loadedNodeIds.has(e.to)) missingNodeIds.add(e.to);
    });

    if (missingNodeIds.size > 0) {
      console.warn(
        `경고: ${missingNodeIds.size}개의 노드가 엣지에 참조되지만 로드되지 않았습니다.`,
      );
      // 누락된 노드가 있으면 추가로 로드 시도
      try {
        const missingIdsParam = Array.from(missingNodeIds)
          .slice(0, GRAPH_CONFIG.limits.nodes)
          .join(",");
        const missingNodesRes = await apiCall(
          `/api/v1/graph/nodes?limit=${GRAPH_CONFIG.limits.nodes}&node_ids=${encodeURIComponent(missingIdsParam)}`,
        );
        const missingNodes = (missingNodesRes?.nodes || []).filter(
          (n) => n && n.id,
        );
        NODES.push(...missingNodes);
        // 개발 환경에서만 로그
        const isDevelopment =
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.protocol === "file:";
        if (isDevelopment) {
          console.debug(`누락된 노드 ${missingNodes.length}개 추가 로드 완료`);
        }
      } catch (e) {
        console.warn("누락된 노드 로드 실패:", e);
      }
    }

    // 엣지 필터링: 양쪽 노드가 모두 로드된 엣지만 유지
    const finalNodeIds = new Set(NODES.map((n) => n.id));
    EDGES = EDGES.filter(
      (e) => finalNodeIds.has(e.from) && finalNodeIds.has(e.to),
    );

    // 프로덕션에서는 숨김
    const isDevelopment =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.protocol === "file:";

    const typeCounts = {
      company: NODES.filter((n) => n.type === "company").length,
      person: NODES.filter((n) => n.type === "person").length,
      major: NODES.filter((n) => n.type === "major").length,
      institution: NODES.filter((n) => n.type === "institution").length,
    };

    if (isDevelopment) {
      console.info("그래프 로드 완료:", {
        nodes: NODES.length,
        edges: EDGES.length,
        nodeTypes: typeCounts,
        timestamp: new Date().toISOString(),
      });
    }
    // node-counts API 실패/0건이면 로드된 NODES 기준으로 노드 유형 건수 표시
    const hasCounts = GRAPH_CONFIG.nodeTypes.some(
      (t) => (nodeCounts[t] || 0) > 0,
    );
    if (!hasCounts && NODES.length > 0) {
      nodeCounts = { ...typeCounts };
      updateFilterCounts();
    }

    if (NODES.length === 0) {
      updateStatus("데이터 없음", false);
      hideGraphLoading();
      showEmptyState();
      return;
    }

    // positions 계산을 위해 최소 1개 타입 필터 보장
    if (activeFilters.size === 0) {
      activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
      document.querySelectorAll(".filter-pill").forEach((pill) => {
        pill.classList.add("active");
      });
    }

    updateStatus("레이아웃 계산 중...", false);
    // 메시지 일관성
    showGraphLoading(
      LOADING_MESSAGES.computingLayout,
      LOADING_GUIDANCE.computingLayout,
      75,
      2,
    );
    // 뷰포트 준비 후 레이아웃 실행
    await new Promise((r) => requestAnimationFrame(r));
    getGraphViewport();
    let vp = getGraphViewport();
    if (vp.width * vp.height < 20000) {
      await new Promise((r) => setTimeout(r, 80));
      vp = getGraphViewport();
    }
    // 서버 레이아웃은 초기 위치 힌트로만 사용
    // 실제 레이아웃은 Vis.js physics가 자동으로 계산
    let layoutDone = false;
    if (GRAPH_CONFIG.useServerLayout) {
      const graphView = buildGraphView(NODES, EDGES, activeFilters);
      if (graphView.allNodes.length > 0) {
        const nodeIdSet = new Set(graphView.allNodes.map((n) => n.id));
        const edgesForLayout = EDGES.filter(
          (e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to),
        );
        try {
          const serverPos = await fetchServerLayout(
            graphView.allNodes,
            edgesForLayout,
            vp.width,
            vp.height,
          );
          if (
            serverPos &&
            Object.keys(serverPos).length >= graphView.allNodes.length
          ) {
            // 서버 레이아웃을 초기 위치로 사용 (physics가 이를 기반으로 최적화)
            Object.assign(positions, serverPos);
            layoutDone = true;
          }
        } catch (e) {
          console.warn("Server layout failed, using Vis.js physics only:", e);
          updateStatus("Vis.js 자동 레이아웃 모드", false);
          setTimeout(() => {
            updateStatus("Neo4j 연결됨", true);
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
        console.error("initPositions failed:", e);
        // 실패해도 physics가 자동으로 레이아웃 계산
        positions = {};
      }
    }

    // positions 비었을 때 최소 fallback
    if (NODES.length > 0 && Object.keys(positions).length === 0) {
      const vp = getGraphViewport();
      const cx = vp.width / 2;
      const cy = vp.height / 2;
      const radius = Math.min(vp.width, vp.height) * 0.35;
      NODES.forEach((n, i) => {
        const angle = (i / Math.max(NODES.length, 1)) * Math.PI * 2;
        positions[n.id] = {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        };
      });
    }

    updateStatus("렌더링 중...", false);
    // 메시지 일관성
    showGraphLoading(
      LOADING_MESSAGES.rendering,
      LOADING_GUIDANCE.rendering,
      90,
      3,
    );
    try {
      renderGraph();
      window._loadGraphRendering = false;
      if (visNetwork) {
        setTimeout(() => {
          visNetwork.fit({ animation: { duration: 300 } });
        }, 100);
      }
      hideGraphLoading();
      updateStatus("Neo4j 연결됨", true);
    } catch (renderError) {
      window._loadGraphRendering = false;
      console.error("Render failed:", renderError);
      hideGraphLoading();
      updateStatus("렌더링 실패", false);
      // 렌더링 실패해도 앱은 계속 작동하도록
    }
  } catch (e) {
    window._loadGraphRendering = false;
    hideGraphLoading();
    updateStatus("연결 실패", false);
    console.error("Load graph failed:", e);
    showConnectionError();
  }
}

// 에러 분류
const ERROR_CODES = {
  CONTAINER_NOT_FOUND: "CONTAINER_001",
  BACKEND_CONNECTION_FAILED: "BACKEND_001",
  NEO4J_CONNECTION_FAILED: "NEO4J_001",
  NETWORK_ERROR: "NETWORK_001",
  TIMEOUT: "TIMEOUT_001",
  SERVICE_UNAVAILABLE: "SERVICE_001",
  SERVER_ERROR: "SERVER_001",
  UNKNOWN: "UNKNOWN_001",
};

// 자동 재시도 카운터
let retryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 3000; // 3초

function classifyError(err) {
  if (!err) return ERROR_CODES.UNKNOWN;

  const message = (err.message || "").toString();
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return ERROR_CODES.NETWORK_ERROR;
  }
  if (message.includes("Backend") && message.includes("연결")) {
    return ERROR_CODES.BACKEND_CONNECTION_FAILED;
  }
  if (message.includes("timeout") || message.includes("Timeout")) {
    return ERROR_CODES.TIMEOUT;
  }
  if (message.includes("503")) {
    return ERROR_CODES.SERVICE_UNAVAILABLE;
  }
  if (message.includes("500")) {
    return ERROR_CODES.SERVER_ERROR;
  }
  return ERROR_CODES.UNKNOWN;
}

// 자동 재시도 (최대 3회, 지수 백오프)
function retryConnection() {
  retryCount++;
  if (retryCount > MAX_RETRIES) {
    retryCount = 0; // 리셋
    showConnectionError(new Error("최대 재시도 횟수 초과"));
    return;
  }
  
  // 재시도 중 상태 표시
  showRetryingState();
  
  const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount - 1); // 지수 백오프
  setTimeout(async () => {
    try {
      await apiCall("/ping");
      // 성공 시 페이지 새로고침
      location.reload();
    } catch (e) {
      // 실패 시 재시도
      retryConnection();
    }
  }, delay);
}

function showRetryingState() {
  const graphArea = document.getElementById("graphArea");
  if (!graphArea) return;
  graphArea.innerHTML = `
    <div class="retrying-container">
      <div class="spinner"></div>
      <p style="font-size:14px;color:var(--text-2);margin-top:8px;">연결 재시도 중... (${retryCount}/${MAX_RETRIES})</p>
    </div>
  `;
}

function toggleErrorDetails() {
  const details = document.getElementById("errorDetails");
  if (details) {
    details.classList.toggle("hidden");
  }
}

// 에러 메시지·재시도 UI
function showConnectionError(err) {
  const graphArea = document.getElementById("graphArea");
  if (!graphArea) return;
  
  const errorType = classifyError(err);
  const tryUrl = API_BASE + "/ping";
  
  const errorMessages = {
    [ERROR_CODES.NETWORK_ERROR]: "네트워크 연결을 확인해주세요",
    [ERROR_CODES.BACKEND_CONNECTION_FAILED]: "서버에 연결할 수 없습니다",
    [ERROR_CODES.TIMEOUT]: "서버 응답 시간이 초과되었습니다",
    [ERROR_CODES.SERVICE_UNAVAILABLE]: "서비스가 일시적으로 사용할 수 없습니다",
    [ERROR_CODES.SERVER_ERROR]: "서버 오류가 발생했습니다",
    [ERROR_CODES.UNKNOWN]: "서버에 연결할 수 없습니다",
  };

  const userMessage = errorMessages[errorType] || errorMessages[ERROR_CODES.UNKNOWN];
  const isLocalBackend =
    API_BASE.indexOf("localhost") !== -1 || API_BASE.indexOf("127.0.0.1") !== -1;
  const remoteTip =
    !isLocalBackend
      ? " 원격 서버는 절전 후 첫 연결에 30초~1분 걸릴 수 있습니다. 잠시 후 '다시 시도'를 눌러보세요."
      : "";

  console.error("Connection error:", {
    type: errorType,
    message: err?.message || "Unknown error",
    apiBase: API_BASE,
    timestamp: new Date().toISOString(),
  });

  graphArea.innerHTML = `
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <h2 class="error-title">${userMessage}</h2>
      <p class="error-message">서버가 실행 중인지 확인해주세요.${remoteTip}</p>
      <p class="error-message" style="margin-top:8px;font-size:12px;color:var(--text-3);">
        연결 시도 주소: <code style="word-break:break-all;">${tryUrl}</code>
      </p>
      <div class="error-actions">
        <button class="btn-primary" onclick="retryConnection()">다시 시도</button>
        <button class="btn-secondary" onclick="toggleErrorDetails()">상세 정보</button>
      </div>
      <div class="error-details hidden" id="errorDetails">
        <div class="error-details-content">
          <p><strong>연결 주소:</strong> <code>${tryUrl}</code></p>
          <p><strong>에러 타입:</strong> <code>${errorType}</code></p>
          <p><strong>해결 방법:</strong></p>
          <ol>
            <li>로컬: 터미널에서 <code>make run-be</code> 실행 후 이 페이지에서 다시 시도</li>
            <li>포트 충돌 시 <code>make stop-be</code> 후 <code>make run-be</code></li>
            <li>진단: <code>make check-be</code> 또는 <code>curl ${tryUrl}</code></li>
          </ol>
          <p style="margin-top:12px;">파일로 열었다면: <code>make serve-graph</code> 실행 후 <code>http://localhost:8080/static/graph.html</code> 접속</p>
        </div>
      </div>
    </div>
  `;
  
  // 에러 코드별 자동 복구 시도
  if (errorType === ERROR_CODES.BACKEND_CONNECTION_FAILED || errorType === ERROR_CODES.NETWORK_ERROR) {
    setTimeout(() => {
      if (retryCount === 0) {
        retryConnection();
      }
    }, 5000); // 5초 후 자동 재시도
  }
}

// CSS 클래스 사용
function showServiceUnavailable() {
  const graphArea = document.getElementById("graphArea");
  if (!graphArea) return;
  
  updateStatus("서비스 일시 중단", false, ERROR_CODES.SERVICE_UNAVAILABLE);
  
  graphArea.innerHTML = `
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <h2 class="error-title">일시적으로 서비스를 사용할 수 없습니다</h2>
      <p class="error-message">
        Neo4j 또는 API 서버에 일시적 오류가 있을 수 있습니다.<br/>
        .env 의 NEO4J_URI, NEO4J_PASSWORD 를 확인하고 Backend 로그를 확인하세요.
      </p>
      <div class="error-actions">
        <button class="btn-primary" onclick="location.reload()">다시 시도</button>
      </div>
    </div>
  `;
}

// CSS 클래스 사용
function showEmptyState() {
  const graphArea = document.getElementById("graphArea");
  if (!graphArea) return;
  graphArea.innerHTML = `
    <div class="error-container">
      <div class="error-icon">📊</div>
      <h2 class="error-title">데이터가 없습니다</h2>
      <p class="error-message">
        Neo4j 데이터베이스에 노드가 없거나<br/>
        필터 조건에 맞는 데이터가 없습니다.
      </p>
    </div>
  `;
}

// Ego 그래프 에러 메시지 렌더
function renderEgoGraphError(errorType, errorMessage, nodeId) {
  const errorDetails = {
    NOT_FOUND: ERROR_MESSAGES.EGO_GRAPH_NODE_NOT_FOUND,
    UNKNOWN: errorMessage || "알 수 없는 오류가 발생했습니다.",
  };
  
  const detailText = esc(errorDetails[errorType] || errorDetails.UNKNOWN);
  const safeNodeId = esc(nodeId);
  
  return `
    <div class="error-message-inline">
      <div class="error-icon-small">⚠️</div>
      <div class="error-content">
        <p class="error-title">${esc(ERROR_MESSAGES.EGO_GRAPH_LOAD_FAILED)}</p>
        <p class="error-detail">${detailText}</p>
        <button class="btn-retry" data-action="retry-ego-graph" data-node-id="${safeNodeId}">다시 시도</button>
      </div>
    </div>
  `;
}

// Ego 그래프 에러 표시
function showEgoGraphError(errorType, errorMessage, nodeId) {
  const nodeDetail = document.getElementById("nodeDetail");
  if (!nodeDetail) return;
  
  // 기존 내용 대체 (에러 상태 명확화)
  nodeDetail.innerHTML = renderEgoGraphError(errorType, errorMessage, nodeId);
  
  // 이벤트 위임 (setupEgoGraphErrorListeners)
}

async function loadNodeDetail(nodeId) {
  if (nodeDetailCache[nodeId]) return nodeDetailCache[nodeId];
  try {
    const data = await apiCall(`/api/v1/graph/nodes/${nodeId}`);
    nodeDetailCache[nodeId] = data;
    return data;
  } catch (e) {
    console.error("Load node detail failed:", e);
    return null;
  }
}

async function sendChatMessage(question) {
  const contextLabel = chatContext ? chatContext.label : null;
  const enhancedQ = contextLabel
    ? `"${contextLabel}"에 대해: ${question}`
    : question;

  try {
    const res = await apiCall("/api/v1/chat", {
      method: "POST",
      body: JSON.stringify({ question: enhancedQ }),
    });
    return res;
  } catch (e) {
    throw new Error("채팅 요청 실패");
  }
}

// 헤더 메시지 20자 제한, 툴팁에 전체 표시
function updateStatus(text, ok, errorCode = null) {
  const el = document.getElementById("statusText");
  if (el) {
    // 긴 메시지는 축약 (20자 이하)
    const shortText = text.length > 20 ? text.substring(0, 17) + "..." : text;
    el.textContent = shortText;
    el.title = text; // 전체 메시지는 툴팁으로
    if (errorCode) {
      el.dataset.errorCode = errorCode;
    } else {
      delete el.dataset.errorCode;
    }
  }
  const dot = document.getElementById("statusDot");
  if (dot) dot.className = ok ? "sdot" : "sdot error";
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// LOADING (로딩 오버레이: loadingOverlay, loadingText, loadingSteps, loadingBar)
// 단계별 진행률·접근성·메시지 단일 소스
// ═══════════════════════════════════════════════════════════════════════════
const LOADING_MESSAGES = {
  default: "UI 구성 중…",
  connecting: "서버 연결 중…",
  loadingData: "그래프 데이터 불러오는 중…",
  loadingNodes: "노드 로딩 중…",
  computingLayout: "그래프 구성 중…",
  rendering: "렌더링 중…",
  loadingEgo: "지배구조 맵 로딩 중…",
  //  노드 상세 — 단일 소스, 추후 서버 진행도 이벤트 시 updateNodeDetailLoadingMessage로 확장
  nodeDetailLoading: "노드 상세 불러오는 중…",
  nodeDetailLoadError: "상세 정보를 불러올 수 없습니다.",
};

const LOADING_GUIDANCE = {
  connecting: "Backend 서버에 연결합니다",
  loadingData: "데이터가 많으면 최대 1분까지 걸릴 수 있습니다", //  UX 개선 - "최대" 명시
  loadingNodes: "연결된 노드 정보를 불러옵니다",
  computingLayout: "노드 위치를 계산합니다 (잠시 걸릴 수 있습니다)",
  rendering: "그래프를 그리는 중입니다",
  loadingEgo: "Ego-Graph 데이터를 가져옵니다",
};

function showGraphLoading(
  stepText,
  hintText,
  progressPercent = null,
  activeStep = null,
) {
  const overlay = document.getElementById("loadingOverlay");
  const textEl = document.getElementById("loadingText");
  const guidanceEl = document.getElementById("loadingGuidance");
  const progressEl = document.getElementById("loadingBar");
  const progressContainer = overlay?.querySelector(".loading-progress");
  const stepsEl = document.getElementById("loadingSteps");

  if (!overlay) return;

  // 오버레이 표시
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-busy", "true");

  // 메시지 업데이트 (기본값)
  if (textEl) textEl.textContent = stepText || LOADING_MESSAGES.default;
  if (guidanceEl) {
    if (hintText) {
      guidanceEl.textContent = hintText;
      guidanceEl.style.display = "block";
    } else {
      guidanceEl.style.display = "none";
    }
  }

  // 프로그레스바 업데이트
  if (progressPercent !== null && progressEl && progressContainer) {
    const clamped = Math.max(0, Math.min(100, progressPercent));
    progressEl.style.width = `${clamped}%`;
    progressContainer.setAttribute("aria-valuenow", clamped);
    progressContainer.setAttribute("aria-label", `진행률: ${clamped}%`);
    progressContainer.setAttribute("data-progress", `${clamped}%`);
    overlay.classList.add("has-progress");
  } else if (progressEl && progressContainer) {
    // Indeterminate 모드 (애니메이션)
    progressEl.style.width = "0%";
    progressEl.style.animation =
      "loading-progress-indeterminate 2s ease-in-out infinite";
    overlay.classList.add("has-progress");
  }

  // 단계 인디케이터 업데이트
  if (activeStep !== null && stepsEl) {
    const stepItems = stepsEl.querySelectorAll(".step-item");
    stepItems.forEach((item, idx) => {
      if (idx < activeStep) {
        item.classList.add("completed");
        item.classList.remove("active");
      } else if (idx === activeStep) {
        item.classList.add("active");
        item.classList.remove("completed");
      } else {
        item.classList.remove("active", "completed");
      }
    });
  }
}

function hideGraphLoading() {
  const overlay = document.getElementById("loadingOverlay");
  const stepsEl = document.getElementById("loadingSteps");

  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-busy", "false");
  }

  //  모든 단계 완료 처리
  if (stepsEl) {
    const stepItems = stepsEl.querySelectorAll(".step-item");
    stepItems.forEach((item) => {
      item.classList.add("completed");
      item.classList.remove("active");
    });
  }
}

/* ═══════════════════════════════════════════
   GRAPH ENGINE (Vis.js 단일 체제)
═══════════════════════════════════════════ */
//  ID 변경 (tooltip → graphTooltip)
const tooltip = document.getElementById("graphTooltip");

/** 캔버스 크기 단일 소스 - Vis.js 컨테이너는 CSS 100%로 처리 */
function getGraphViewport() {
  const graphArea = document.getElementById("graphArea");
  if (!graphArea) return { width: 900, height: 600 };
  const w = Math.max(graphArea.clientWidth || 0, 400);
  const h = Math.max(graphArea.clientHeight || 0, 300);
  return { width: w || 900, height: h || 600 };
}

/** Ego-Graph 전용: HOLDS_SHARES 방향(holder→company)으로 계층 배치. 한 레이어에 노드 많으면 여러 행으로 줄바꿈해 겹침 방지. */
function computeHierarchicalLayout(egoId) {
  const connectedNodeIds = new Set();
  EDGES.forEach((e) => {
    connectedNodeIds.add(e.from);
    connectedNodeIds.add(e.to);
  });
  const nodes = NODES.filter((n) => connectedNodeIds.has(n.id));
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
    EDGES.forEach((e) => {
      if (e.from === cur && !(e.to in layerBy)) {
        layerBy[e.to] = curLayer + 1;
        queue.push(e.to);
      }
      if (e.to === cur && !(e.from in layerBy)) {
        layerBy[e.from] = curLayer - 1;
        queue.push(e.from);
      }
    });
  }
  const layerToIds = {};
  nodes.forEach((n) => {
    if (layerBy[n.id] == null) layerBy[n.id] = 0;
    const L = layerBy[n.id];
    if (!layerToIds[L]) layerToIds[L] = [];
    layerToIds[L].push(n.id);
  });
  const minL = Math.min(...Object.values(layerBy));
  const maxL = Math.max(...Object.values(layerBy));
  const sortedLayers = [...new Set(Object.keys(layerToIds).map(Number))].sort(
    (a, b) => a - b,
  );

  const perRow = Math.max(1, Math.floor(width / minNodeSpacing));
  const subRowHeight = LAYOUT_CONFIG.ego.subRowHeight;
  const layerRowCount = {};
  let maxRowsInLayer = 1;
  sortedLayers.forEach((L) => {
    const count = layerToIds[L].length;
    const rows = Math.max(1, Math.ceil(count / perRow));
    layerRowCount[L] = rows;
    if (rows > maxRowsInLayer) maxRowsInLayer = rows;
  });
  const minLayerHeight = subRowHeight * maxRowsInLayer;
  const layerHeight = Math.max(
    minLayerHeight,
    (H - 2 * padding) / Math.max(1, sortedLayers.length),
  );

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
      const rowY =
        baseY + (rows > 1 ? (row - (rows - 1) / 2) * subRowHeight : 0);
      slice.forEach((id, i) => {
        const x =
          slice.length === 1
            ? padding + width / 2
            : padding + (i / (slice.length - 1)) * width;
        positions[id] = { x, y: rowY };
      });
    }
  });
  nodes.forEach((n) => {
    if (!positions[n.id])
      positions[n.id] = { x: padding + width / 2, y: H / 2 };
  });
}

/** 연결 요소(Connected Components) 탐지 — BFS */
function getConnectedComponents(nodes, edges) {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, new Set()));
  edges.forEach((e) => {
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
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length); // 큰 컴포넌트 먼저
}

/** 그래프 단일 뷰 모델. 레이아웃/렌더가 동일한 allNodes·차수·컴포넌트 참조. */
function buildGraphView(nodes, edges, typeFilterSet) {
  const connectedNodeIds = new Set();
  edges.forEach((e) => {
    connectedNodeIds.add(e.from);
    connectedNodeIds.add(e.to);
  });
  const allNodes = (nodes || []).filter(
    (n) =>
      n &&
      n.id &&
      typeFilterSet.has(canonicalNodeType(n.type)) &&
      connectedNodeIds.has(n.id),
  );
  const nodeDegrees = new Map();
  allNodes.forEach((n) => {
    nodeDegrees.set(
      n.id,
      (edges || []).filter((e) => e.from === n.id || e.to === n.id).length,
    );
  });
  const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1);
  const components = getConnectedComponents(allNodes, edges || []);
  const idToNode = new Map(allNodes.map((n) => [n.id, n]));
  return { allNodes, nodeDegrees, maxDegree, components, idToNode };
}

function initPositions() {
  return new Promise((resolve) => {
    if (!Array.isArray(NODES) || !Array.isArray(EDGES)) {
      console.warn("initPositions: NODES or EDGES is not an array");
      resolve();
      return;
    }

    const graphView = buildGraphView(NODES, EDGES, activeFilters);
    const { allNodes, nodeDegrees, maxDegree, components } = graphView;
    if (allNodes.length === 0) {
      resolve();
      return;
    }

    const { width: W, height: H } = getGraphViewport();
    const pad = LAYOUT_CONFIG.force.padding;
    const realExtent = { xMin: pad, xMax: W - pad, yMin: pad, yMax: H - pad };
    const minLayoutW = 700,
      minLayoutH = 500;
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
        //  노드 겹침 방지 - 노드 수에 비례해 초기 배치 반경 확대
        const minRadiusByCount = Math.max(comp.length * 24, 80); // 16→24, 55→80으로 확대
        const radiusX = Math.min(
          cellW * 0.48,
          Math.max(cellW * 0.35, minRadiusByCount),
        );
        const radiusY = Math.min(
          cellH * 0.48,
          Math.max(cellH * 0.35, minRadiusByCount),
        );
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
      const baseRadiusX = useFullArea
        ? (extent.xMax - extent.xMin) * 0.5
        : Math.min(W, H) * 0.45;
      const baseRadiusY = useFullArea
        ? (extent.yMax - extent.yMin) * 0.5
        : Math.min(W, H) * 0.45;
      //  노드 겹침 방지 - 단일 컴포넌트도 노드 수에 비례해 원을 크게 확장
      const radiusX = Math.max(baseRadiusX, allNodes.length * 20); // 12→20으로 확대 (밀집 방지)
      const radiusY = Math.max(baseRadiusY, allNodes.length * 20);
      const sortedNodes = [...allNodes].sort(
        (a, b) => (nodeDegrees.get(b.id) || 0) - (nodeDegrees.get(a.id) || 0),
      );
      sortedNodes.forEach((n, i) => {
        const nd = (nodeDegrees.get(n.id) || 0) / maxDegree;
        let r =
          nd > 0.8
            ? 0.15 + Math.random() * 0.25
            : nd < 0.2
              ? 0.6 + Math.random() * 0.35
              : 0.25 + (1 - nd) * 0.5;
        const angle =
          (i / Math.max(sortedNodes.length, 1)) * Math.PI * 2 +
          (Math.random() - 0.5) * 1.6;
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
    // 대량 노드 시 반복 수 축소: 초기 진입 속도 우선 (확장성)
    const effectiveMaxIter =
      allNodes.length > 4000
        ? 250
        : allNodes.length > 2500
          ? 400
          : allNodes.length > 1500
            ? 600
            : cfg.maxIter;

    function step() {
      try {
        const batchSize = 12;
        for (let i = 0; i < batchSize && iter < effectiveMaxIter; i++, iter++) {
          allNodes.forEach((n) => {
            if (!positions[n.id]) return;
            let fx = 0,
              fy = 0;
            const r = getLayoutRadius(n); // 라벨 박스 포함 물리적 반지름 (타원/직사각형 충돌)

            const degree = nodeDegrees.get(n.id) || 0;
            const normalizedDegree = degree / maxDegree;

            // Gravity: 비선형 약화 — 중앙 근처에선 힘 미미, 멀어질수록 증가 (F ∝ distance² → 중앙 뭉침 억제)
            const dxToCenter = centerX - positions[n.id].x;
            const dyToCenter = centerY - positions[n.id].y;
            const distToCenter =
              Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter) || 1;
            const gravityMag =
              distToCenter *
              distToCenter *
              (normalizedDegree * cfg.gravity * 1e-5);
            fx += (dxToCenter / distToCenter) * gravityMag;
            fy += (dyToCenter / distToCenter) * gravityMag;

            // Expansion: 무게중심에서 바깥으로 밀어내기 (순환 출자 4~5각형 뭉침 완화)
            const expK = cfg.expansionFromCenter ?? 0;
            if (expK > 0 && distToCenter > 1) {
              fx += ((positions[n.id].x - centerX) / distToCenter) * expK;
              fy += ((positions[n.id].y - centerY) / distToCenter) * expK;
            }

            // Repulsion + Collision: 물리적 반지름 기준 + 차수 기반 반발력(슈퍼노드가 더 넓은 자리 요구)
            const degMult = 1 + degree * (cfg.repulsionDegreeFactor ?? 0.5);
            const effectiveStrength = cfg.repulsionStrength * degMult;
            allNodes.forEach((other) => {
              if (n.id === other.id || !positions[other.id]) return;
              const dx = positions[n.id].x - positions[other.id].x;
              const dy = positions[n.id].y - positions[other.id].y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
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

            // Spring(링크): 반발 워밍업 구간에서는 적용 안 함 → 먼저 퍼뜨린 뒤 링크로 구조 유지            const repulsionOnlyIter = cfg.repulsionOnlyIter ?? 0;
            if (repulsionOnlyIter > 0 && iter < repulsionOnlyIter) {
              // 워밍업: 반발+충돌만. 링크 힘 없음.
            } else {
              EDGES.forEach((e) => {
                const ratio = Math.min(100, Math.max(0.1, e.ratio || 0));
                let baseIdeal;
                if (
                  cfg.useInverseSqrtEdgeLength &&
                  cfg.idealDistBaseLengthForInverseSqrt
                ) {
                  const rawL =
                    cfg.idealDistBaseLengthForInverseSqrt / Math.sqrt(ratio);
                  baseIdeal = Math.max(idealMin, Math.min(idealMax, rawL));
                } else {
                  baseIdeal = idealMax - (ratio / 100) * (idealMax - idealMin);
                }
                const degFrom = nodeDegrees.get(e.from) || 0;
                const degTo = nodeDegrees.get(e.to) || 0;
                const degFactor = cfg.idealDistDegreeFactor ?? 0.2;
                const idealDist =
                  baseIdeal * (1 + (degFrom + degTo) * degFactor);
                if (e.from === n.id && positions[e.to]) {
                  const dx = positions[e.to].x - positions[n.id].x;
                  const dy = positions[e.to].y - positions[n.id].y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const force =
                    ((dist - idealDist) / idealDist) * cfg.edgeForce;
                  fx += (dx / dist) * force;
                  fy += (dy / dist) * force;
                }
                if (e.to === n.id && positions[e.from]) {
                  const dx = positions[e.from].x - positions[n.id].x;
                  const dy = positions[e.from].y - positions[n.id].y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const force =
                    ((dist - idealDist) / idealDist) * cfg.edgeForce;
                  fx += (dx / dist) * force;
                  fy += (dy / dist) * force;
                }
              });
            }

            const damping = cfg.damping ?? 0.78;
            positions[n.id].x += fx * damping;
            positions[n.id].y += fy * damping;
            positions[n.id].x = Math.max(
              extent.xMin,
              Math.min(extent.xMax, positions[n.id].x),
            );
            positions[n.id].y = Math.max(
              extent.yMin,
              Math.min(extent.yMax, positions[n.id].y),
            );
          });
        }

        if (iter < effectiveMaxIter) {
          requestAnimationFrame(step);
        } else {
          // 최종 충돌 해소: 물리적 반지름(원+라벨) 기준으로 분리
          let hasOverlap = false;
          let overlapIterations = 0;
          do {
            hasOverlap = false;
            allNodes.forEach((n) => {
              if (!positions[n.id]) return;
              const r1 = getLayoutRadius(n);
              allNodes.forEach((other) => {
                if (n.id === other.id || !positions[other.id]) return;
                const r2 = getLayoutRadius(other);
                const dx = positions[n.id].x - positions[other.id].x;
                const dy = positions[n.id].y - positions[other.id].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const minSep = r1 + r2;
                if (dist < minSep) {
                  hasOverlap = true;
                  const separation = (minSep - dist) / 2;
                  positions[n.id].x += (dx / dist) * separation;
                  positions[n.id].y += (dy / dist) * separation;
                  positions[other.id].x -= (dx / dist) * separation;
                  positions[other.id].y -= (dy / dist) * separation;
                  positions[n.id].x = Math.max(
                    extent.xMin,
                    Math.min(extent.xMax, positions[n.id].x),
                  );
                  positions[n.id].y = Math.max(
                    extent.yMin,
                    Math.min(extent.yMax, positions[n.id].y),
                  );
                  positions[other.id].x = Math.max(
                    extent.xMin,
                    Math.min(extent.xMax, positions[other.id].x),
                  );
                  positions[other.id].y = Math.max(
                    extent.yMin,
                    Math.min(extent.yMax, positions[other.id].y),
                  );
                }
              });
            });
            overlapIterations++;
          } while (hasOverlap && overlapIterations < 50);

          // 공간 효율: 레이아웃 bbox를 실제 뷰포트(realExtent) 90%에 맞춤. scale 하한 1로 압축 금지.
          let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
          allNodes.forEach((n) => {
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
          let scale = Math.max(
            1,
            Math.min(targetW / spanX, targetH / spanY, 4),
          );
          if (!Number.isFinite(scale) || scale <= 0) scale = 1;
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const extentCx = (realExtent.xMin + realExtent.xMax) / 2;
          const extentCy = (realExtent.yMin + realExtent.yMax) / 2;
          allNodes.forEach((n) => {
            if (!positions[n.id]) return;
            const x = extentCx + (positions[n.id].x - cx) * scale;
            const y = extentCy + (positions[n.id].y - cy) * scale;
            positions[n.id].x = Number.isFinite(x)
              ? Math.max(realExtent.xMin, Math.min(realExtent.xMax, x))
              : extentCx;
            positions[n.id].y = Number.isFinite(y)
              ? Math.max(realExtent.yMin, Math.min(realExtent.yMax, y))
              : extentCy;
          });

          resolve();
        }
      } catch (err) {
        console.error("initPositions step error:", err);
        resolve();
      }
    }
    try {
      step();
    } catch (syncErr) {
      console.error("initPositions sync error:", syncErr);
      resolve();
    }
  });
}

let visNetwork = null; // Vis.js 네트워크 인스턴스
let visNetworkEventsSetup = false; //  이벤트 리스너 중복 등록 방지
let physicsEnabledState = false; //  physics 상태 추적 (getOptions 대신 사용)

//  getScale 비정상(0/NaN) 시 1.0 반환 — 라벨·줌 컨트롤 사이드 이펙트 방지, 단일 진입점
function getScaleSafe(network) {
  if (!network || typeof network.getScale !== "function") return 1.0;
  const s = network.getScale();
  return typeof s === "number" && s > 0 ? s : 1.0;
}

//  검색/연결 노드 클릭 시 노드 이름 미표시 방지 — API·DOM·Vis.js 간 id 타입(문자열/숫자) 불일치 흡수, 단일 진입점
function nodeIdsEqual(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/**
 * 빈 공간 클릭 시 선택 해제만 반영 — setData/renderGraph 호출 없이 기존 노드 스타일만 갱신.
 * 레이아웃·physics 유지로 "한 덩어리로 붙는" 현상 및 지속적 밀집 재현 방지).
 */
function clearSelectionVisualState(network) {
  if (!network || !network.body || !network.body.data || !network.body.data.nodes) return;
  const nodesDataSet = network.body.data.nodes;
  const ids = nodesDataSet.getIds();
  if (ids.length === 0) return;
  const updates = [];
  for (const id of ids) {
    const visNode = nodesDataSet.get(id);
    if (!visNode || !visNode.color) continue;
    const borderColor = visNode.color.border || "#999";
    updates.push({
      id,
      color: {
        background: getNodeFillColor(borderColor, 0.15),
        border: borderColor,
        highlight: {
          background: getNodeFillColor(borderColor, 0.3),
          border: borderColor,
        },
        opacity: 1,
      },
      borderWidth: 2,
      shadow: false,
    });
  }
  if (updates.length > 0) nodesDataSet.update(updates);
  //  선택 시 비연결 엣지 dimming(0.2) 해제 — 엣지도 opacity 1로 복원
  const edgesDataSet = network.body.data.edges;
  if (edgesDataSet && typeof edgesDataSet.getIds === "function") {
    const edgeIds = edgesDataSet.getIds();
    const edgeUpdates = edgeIds.map((id) => {
      const edge = edgesDataSet.get(id);
      if (!edge || !edge.color) return null;
      return {
        id,
        color: {
          color: edge.color.color || "#8b7d6f",
          highlight: edge.color.highlight || "#d85604",
          opacity: 1,
        },
      };
    }).filter(Boolean);
    if (edgeUpdates.length > 0) edgesDataSet.update(edgeUpdates);
  }
}

//  Vis.js 이벤트 리스너 설정 (UX 패턴 반영)
function setupVisNetworkEvents(network) {
  if (visNetworkEventsSetup) return;

  // 노드 클릭: openEgoOnNodeClick이면 ego 로드, 아니면 selectNode(상세 패널 + dimming + 포커스)
  network.on("click", (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = NODES.find((n) => nodeIdsEqual(n.id, nodeId));
      if (node) {
        if (GRAPH_CONFIG.openEgoOnNodeClick) {
          loadEgoGraph(nodeId);
          return;
        }
        selectNode(node); // 내부에서 renderGraph 후 focusOnNode 호출 (포커스·유동성 이슈 방지)
      }
    } else {
      //  빈 공간 클릭 시 전체 재렌더 없이 선택 해제만 적용 — 밀집 재현·지속 이슈 방지
      selectedNodeId = null;
      connectedNodeIds.clear();
      network.unselectAll();
      clearSelectionVisualState(network);
      showEmptyPanel(true); //  재렌더 생략으로 레이아웃 유지(밀집 재현 방지)
    }
  });

  //  호버 시 라벨 강조 (가독성 개선)
  network.on("hoverNode", (params) => {
    const node = NODES.find((n) => nodeIdsEqual(n.id, params.node));
    if (node) {
      showTooltip(node, params.event.x, params.event.y);

      // 호버된 노드의 라벨 강조
      const visNode = network.body.data.nodes.get(params.node);
      if (visNode) {
        visNode.font.size = Math.max(visNode.font.size || 12, 16); // 최소 16px
        visNode.font.background = "rgba(255, 255, 255, 0.95)"; // 배경 강조
        visNode.font.strokeWidth = 3; // 테두리 두께 증가
        network.redraw();
      }
    }
  });

  network.on("blurNode", (params) => {
    hideTooltip();

    // 호버 해제 시 원래 크기로 복원
    if (params && params.node) {
      const visNode = network.body.data.nodes.get(params.node);
      if (visNode) {
        const node = NODES.find((n) => nodeIdsEqual(n.id, params.node));
        const isSelected = nodeIdsEqual(selectedNodeId, params.node);
        const isConnected = connectedNodeIds.has(String(params.node));

        // 원래 폰트 크기로 복원
        visNode.font.size = isSelected ? 14 : isConnected ? 13 : 12;
        visNode.font.background = "white";
        visNode.font.strokeWidth = 2;
        network.redraw();
      }
    }
  });

  // 클러스터링: 더블클릭으로 확장/축소 (Vis.js 기본 기능)
  network.on("doubleClick", (params) => {
    if (params.nodes.length > 0 && network.isCluster(params.nodes[0])) {
      network.openCluster(params.nodes[0]);
    }
  });

  visNetworkEventsSetup = true;
}

function renderGraphWithVisJs() {
  if (NODES.length === 0) return;
  //  ego(지배구조 맵)는 Vis.js hierarchical이 위치 계산 — positions 불필요. 비-ego에서만 positions 필수
  if (!isEgoMode && Object.keys(positions).length === 0) {
    console.warn("renderGraphWithVisJs: positions not initialized yet");
    return;
  }

  //  Vis.js 라이브러리 로드 확인 (필수)
  if (typeof vis === "undefined" || !vis.Network) {
    console.error(
      "Vis.js not loaded. This should not happen if waitForVisJs() worked correctly.",
    );
    updateStatus("Vis.js 라이브러리 로드 실패", false);
    return;
  }

  //  Vis.js 컨테이너 확인 (레거시 컨테이너 참조 제거 완료)
  let container = document.getElementById("visNetwork");

  if (!container) {
    //  상세한 디버깅 정보 제공
    const graphArea = document.getElementById("graphArea");
    const allContainers = graphArea
      ? Array.from(
          graphArea.querySelectorAll(
            '[id*="vis"], [id*="network"], [id*="graph"]',
          ),
        )
      : [];

    console.error("Vis.js 컨테이너를 찾을 수 없습니다:", {
      expectedId: "visNetwork",
      graphAreaExists: !!graphArea,
      graphAreaChildren: graphArea
        ? Array.from(graphArea.children).map((c) => ({
            id: c.id,
            className: c.className,
            tagName: c.tagName,
          }))
        : [],
      similarContainers: allContainers.map((c) => ({
        id: c.id,
        className: c.className,
      })),
    });

    updateStatus(
      "컨테이너 오류",
      false,
      ERROR_CODES.CONTAINER_NOT_FOUND,
    );

    //  사용자에게 명확한 안내
    console.error(
      "그래프 컨테이너가 없습니다. 페이지를 새로고침하거나 개발자에게 문의하세요.",
    );
    return;
  }

  //  컨테이너 크기 초기화 보장 (CSS 100%만으로는 초기 렌더링 실패 가능)
  const { width: vpW, height: vpH } = getGraphViewport();
  if (container.offsetWidth === 0 || container.offsetHeight === 0) {
    container.style.width = vpW + "px";
    container.style.height = vpH + "px";
  }

  //  단일 진입점 — 초기 랜딩·"전체 그래프로 돌아가기" 클릭 시 동일 제한 적용 (밀집 방지)
  let { visibleNodes, didApplyLimit } =
    isEgoMode
      ? {
          visibleNodes: NODES.filter((n) =>
            activeFilters.has(canonicalNodeType(n.type)),
          ),
          didApplyLimit: false,
        }
      : computeVisibleNodesForRender(NODES, EDGES, activeFilters);

  //  검색·연관검색어 클릭 시 선택 노드가 제한(380)으로 빠지면 이름 미표시 — 선택 노드는 항상 표시 집합에 포함
  if (selectedNodeId) {
    const selectedNode = NODES.find((n) => nodeIdsEqual(n.id, selectedNodeId));
    const alreadyVisible = visibleNodes.some((n) => nodeIdsEqual(n.id, selectedNodeId));
    if (selectedNode && !alreadyVisible) {
      visibleNodes = visibleNodes.slice();
      visibleNodes.push(selectedNode);
    }
  }

  if (didApplyLimit && !window._initialViewNotified) {
    updateStatus(
      `가독성: 중요 노드 ${visibleNodes.length}개만 표시됩니다. '개인주주' 필터 또는 필터 조정으로 더 보기.`,
      true,
    );
    window._initialViewNotified = true;
    setTimeout(() => {
      if (window._initialViewNotified) {
        updateStatus("Neo4j 연결됨", true);
        window._initialViewNotified = false;
      }
    }, 5000);
  }

  const visibleIds = new Set();
  visibleNodes.forEach((n) => {
    visibleIds.add(n.id);
    visibleIds.add(String(n.id));
  });
  const visibleEdges = EDGES.filter(
    (e) => visibleIds.has(e.from) && visibleIds.has(e.to),
  );
  //  UX 패턴 - 노드 상태에 따른 시각적 차별화 (focused/dimmed 효과)
  const visNodes = visibleNodes.map((n) => {
    const p = positions[n.id] || { x: vpW / 2, y: vpH / 2 };
    const useFixedPosition = !isEgoMode && positions[n.id];
    const color = getNodeColor(n);
    const isSelected = nodeIdsEqual(selectedNodeId, n.id);
    //  전역 변수 connectedNodeIds 사용 (설정 시 String으로 저장 — 타입 불일치 방지)
    const isConnected = selectedNodeId ? connectedNodeIds.has(String(n.id)) : false;

    //  데이터 기반 동적 노드 크기 계산 (연결 수 + 지분율 + 상태)
    const nodeSize = calculateNodeSize(
      n,
      visibleEdges,
      selectedNodeId,
      connectedNodeIds,
    );

    //  노드 상태별 투명도 (dimming 효과)
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

    //  노드 채우기 색상 생성 (범례와 일치하도록 연한 버전)
    const fillColor = getNodeFillColor(
      color,
      opacity < 1.0 ? opacity * 0.3 : 0.15,
    );

    //  줌 레벨 기반 라벨 표시 — 노드 이름 일시적 비표시 이슈 완화 (getScaleSafe 단일 진입점)
    const currentZoom = getScaleSafe(visNetwork);
    const minZoomForLabels = 0.92; //  1.2→0.92 — 일반 줌에서도 라벨 표시, "이름 안 보임" 이슈 감소
    const showLabel =
      currentZoom >= minZoomForLabels || isSelected || isConnected;

    //  중요도 기반 라벨 표시 (줌이 매우 낮을 때만 일부 숨김)
    let labelText = "";
    let labelFontSize = 0;
    if (showLabel) {
      labelText = n.label || n.id;
      const nodeEdges = visibleEdges.filter(
        (e) => e.from === n.id || e.to === n.id,
      );
      const degree = nodeEdges.length;
      const isImportant = degree >= 8 || isSelected; //  10→8 — 더 많은 노드에 라벨 노출

      if (currentZoom < 1.0 && !isImportant && !isSelected && !isConnected) {
        //  1.5→1.0 — 줌 1.0 이상에서는 대부분 라벨 표시
        labelText = "";
        labelFontSize = 0;
      } else {
        labelFontSize = isSelected ? 14 : isImportant ? 13 : 12;
      }
    }
    //  검색/클릭 후 포커스된 노드는 항상 라벨 표시 (노드 이름 안 나오는 이슈 방지)
    if (isSelected) {
      labelText = labelText || n.label || n.id;
      labelFontSize = Math.max(labelFontSize || 0, 12);
    }

    const nodeOption = {
      id: n.id,
      label: labelText,
      // ego 모드(지배구조 맵)에서는 x,y 생략 → Vis.js hierarchical이 위치 계산
      ...(useFixedPosition ? { x: p.x, y: p.y } : {}),
      // 타 서비스 패턴 - physics 활성화 시 동적 위치 관리 (안정화 후 고정)
      // fixed 속성 제거: 초기 안정화 전에는 동적, 안정화 후에는 physics: false로 고정
      color: {
        background: fillColor, //  채우기 색상 (범례와 일치)
        border: color,
        highlight: {
          background: getNodeFillColor(color, 0.3), // 호버 시 더 진하게
          border: color,
        },
        opacity: opacity, //  투명도 적용
      },
      shape: "dot",
      size: nodeSize, //  상태별 크기 차별화
      font: {
        size: labelFontSize,
        background: labelText ? "white" : "transparent",
        strokeWidth: labelText ? 2 : 0,
        strokeColor: labelText ? "white" : "transparent",
      },
      borderWidth: isSelected ? 3 : 2, //  선택 시 테두리 두께 증가
      //  shadow는 전역 옵션에서 설정되며, 개별 노드에서는 boolean 또는 객체로 override 가능
      shadow: isSelected
        ? {
            enabled: true,
            color: "rgba(216, 86, 4, 0.4)",
            size: 12,
          }
        : false, // 선택된 노드만 그림자 효과
    };
    return nodeOption;
  });
  const edgeMap = new Map();
  visibleEdges.forEach((e) => {
    const key = `${e.from}-${e.to}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key).push(e);
  });
  //  UX 패턴 - 연결된 엣지만 하이라이트 (네트워크 중심 뷰)
  const connectedEdgeKeys = new Set();
  if (selectedNodeId) {
    visibleEdges.forEach((e) => {
      if (nodeIdsEqual(e.from, selectedNodeId) || nodeIdsEqual(e.to, selectedNodeId)) {
        connectedEdgeKeys.add(`${e.from}-${e.to}`);
      }
    });
  }

  // UX: 줌 레벨 기반 엣지 라벨 표시 (가독성 개선) — getScaleSafe 단일 진입점
  const currentZoomEdge = getScaleSafe(visNetwork);
  const minZoomForEdgeLabels = 1.5; // UX: 엣지 라벨 표시 최소 줌 레벨
  const minRatioForLabel = 1.0; // UX: 라벨 표시 최소 지분율 (%)

  const visEdges = Array.from(edgeMap.entries()).map(([key, edges]) => {
    const e = edges[0];
    //     // - 동일 from->to 사이 관계가 여러 건(리포트/기준일/주식종류 등) 존재 가능
    // - %를 합산하면 100%를 초과하기 쉬우므로, 시각화 라벨은 max(지분율) + (관계 건수)로 표현

    // UX: 안전한 엣지 라벨 포맷팅 (서버 데이터 형식 다양성 처리)
    const edgeLabel = formatEdgeLabel(edges);

    // 지분율 계산 (라벨 표시 조건 확인용) - formatEdgeLabel 내부 로직 재사용
    const safeNumber = (val) => {
      if (val == null || val === "") return 0;
      if (typeof val === "string") {
        const cleaned = val.toString().replace(/[^\d.]/g, "");
        const num = parseFloat(cleaned);
        return Number.isNaN(num) ? 0 : num;
      }
      const n = Number(val);
      return Number.isNaN(n) ? 0 : n;
    };
    const ratios = edges.map((ed) => safeNumber(ed.ratio));
    const maxRatio = Math.max(...ratios, 0);
    const ratio = Math.max(0, Math.min(100, maxRatio));

    //  연결된 엣지만 하이라이트 (네트워크 중심 뷰)
    const isConnected = connectedEdgeKeys.has(key);

    // UX: 줌 레벨 및 중요도 기반 라벨 표시 조건
    let finalLabel = "";
    if (currentZoomEdge >= minZoomForEdgeLabels || isConnected) {
      // 줌 레벨이 높거나 연결된 엣지는 라벨 표시
      finalLabel = edgeLabel;

      // UX: 중요도 기반 추가 필터링 (지분율 1% 미만은 숨김, 단 연결된 엣지는 예외)
      if (ratio < minRatioForLabel && !isConnected && currentZoomEdge < 2.0) {
        finalLabel = "";
      }
    }

    const edgeColor = isConnected ? "#d85604" : "#8b7d6f"; // 연결: 오렌지, 비연결: 회색
    const edgeOpacity = selectedNodeId ? (isConnected ? 1.0 : 0.2) : 1.0; // 선택 시 비연결 엣지 dimming
    const edgeWidth = isConnected
      ? Math.max(2, Math.min(5, ratio / 10))
      : Math.max(1, Math.min(3, ratio / 15));

    return {
      from: e.from,
      to: e.to,
      label: finalLabel, // UX: 조건부 라벨 표시
      smooth: { type: "continuous", roundness: 0.5 }, // 부드러운 엣지
      width: edgeWidth,
      color: {
        color: edgeColor,
        highlight: "#d85604",
        opacity: edgeOpacity, //  투명도 적용
      },
    };
  });
  const data = { nodes: visNodes, edges: visEdges };
  const options = {
    nodes: {
      font: { background: "white", strokeWidth: 2, strokeColor: "white" },
      borderWidth: 2,
      //  UX 패턴 - 그림자 효과 (별처럼 빛나는 효과)
      // 전역 shadow 설정 (개별 노드에서 override 가능)
      shadow: {
        enabled: false, // 기본적으로 비활성화 (선택된 노드만 활성화)
        color: "rgba(216, 86, 4, 0.4)",
        size: 12,
        x: 0,
        y: 0,
      },
    },
    edges: {
      smooth: { type: "continuous", roundness: 0.5 },
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
    },
    // 전체 그래프: physics로 안정화 후 고정. 지배구조 맵(ego): Vis.js hierarchical + physics 비활성화
    physics: isEgoMode
      ? false
      : {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -60,
            centralGravity: 0.005,
            springLength: 150,
            springConstant: 0.04,
            damping: 0.6,
            avoidOverlap: 0.6,
          },
          stabilization: {
            enabled: true,
            iterations: 100,
            fit: true,
          },
        },
    //   - 인터랙션 설정 최적화
    // 문제: 노드 선택 후 줌 기능이 제대로 작동하지 않음
    // 해결: 수동 휠 이벤트 처리로 스크롤과 줌 구분, 안정화 중 인터랙션 제한
    // 주의: zoomKey는 Vis.js에서 지원하지 않는 옵션이므로 제거됨
    interaction: {
      dragNodes: true,
      zoomView: false, // 수동 휠 이벤트 처리로 변경 (스크롤/줌 구분)
      dragView: true, // 드래그/팬은 활성화
      tooltipDelay: 100, // 툴팁 지연 감소
      hover: true, // 호버 효과 활성화
    },
    layout: isEgoMode
      ? { hierarchical: LAYOUT_CONFIG.ego.hierarchical }
      : { improvedLayout: false },
    //  animation은 top-level 옵션이 아님 (moveTo/fit/focus 메서드의 파라미터로만 사용)
    // 노드/엣지 상태 변경 시 부드러운 전환은 physics.enabled=false일 때 자동으로 처리됨
  };

  //  타 서비스 패턴 - 안정화 완료 후 physics 비활성화
  if (visNetwork && !visNetwork._stabilizationHandlerAdded) {
    visNetwork.on("stabilizationIterationsDone", () => {
      // 안정화 완료 후 physics 비활성화하여 위치 고정
      visNetwork.setOptions({ physics: false });
      physicsEnabledState = false; // 상태 추적 업데이트
      console.debug("Graph stabilization completed, physics disabled");
      // 안정화 완료 후 인터랙션 재활성화
      visNetwork.setOptions({
        interaction: {
          dragNodes: true,
          zoomView: false, // 수동 휠 처리 유지
          dragView: true,
        }
      });
    });
    
    // 안정화 시작 시 인터랙션 제한 (사용자 입력 간섭 방지)
    visNetwork.on("stabilizationStart", () => {
      physicsEnabledState = true; // 상태 추적 업데이트
      console.debug("Graph stabilization started, limiting interactions");
      visNetwork.setOptions({
        interaction: {
          dragNodes: false, // 안정화 중 노드 드래그 비활성화
          zoomView: false,
          dragView: false, // 안정화 중 뷰 드래그 비활성화
        }
      });
    });
    
    visNetwork._stabilizationHandlerAdded = true;
  }

  //   - 수동 휠 이벤트 처리 (스크롤/줌 구분)
  // 문제: 노드 선택 후 줌 기능이 제대로 작동하지 않음
  // 해결: 컨테이너에 직접 바인딩하여 노드 선택 후에도 작동 보장
  if (visNetwork && !visNetwork._wheelHandlerAdded) {
    // 컨테이너는 이미 renderGraphWithVisJs 함수에서 정의됨
    const container = document.getElementById('visNetwork');
    if (!container) {
      console.warn('Container not found for wheel event handler');
    } else {
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Ctrl/Cmd + 휠 = 줌 (getScaleSafe로 0/NaN 방지)
        if (e.ctrlKey || e.metaKey) {
          const delta = e.deltaY > 0 ? 0.9 : 1.1; // 휠 아래 = 축소, 위 = 확대
          const currentScale = getScaleSafe(visNetwork);
          const newScale = Math.max(0.3, Math.min(3, currentScale * delta));
          
          // 마우스 위치를 중심으로 줌
          const pointer = visNetwork.getViewPosition();
          visNetwork.moveTo({
            position: pointer,
            scale: newScale,
            animation: false, // 즉시 줌 (부드러운 느낌)
          });
          return;
        }
        
        // 일반 휠 = 팬 (스크롤)
        // 안정화 중이면 팬 비활성화
        //  getOptions()는 Vis.js에서 지원하지 않으므로 상태 변수 사용
        if (physicsEnabledState) {
          return; // 안정화 중에는 팬 비활성화
        }
        
        // 팬 속도 조절
        const panSpeed = 0.5;
        const deltaX = e.deltaX * panSpeed;
        const deltaY = e.deltaY * panSpeed;
        
        const currentView = visNetwork.getViewPosition();
        visNetwork.moveTo({
          position: {
            x: currentView.x - deltaX,
            y: currentView.y - deltaY,
          },
          animation: false,
        });
      }, { passive: false });
      
      visNetwork._wheelHandlerAdded = true;
    }
  }

  //  줌 레벨 변경 시 라벨 표시 업데이트 (가독성 개선)
  // 주의: renderGraph() 호출 시 physics 재활성화 방지
  if (visNetwork && !visNetwork._zoomHandlerAdded) {
    let zoomTimeout = null;
    visNetwork.on("zoom", () => {
      // UX: 디바운싱으로 성능 최적화 (줌 중에는 재렌더링 지연)
      if (zoomTimeout) clearTimeout(zoomTimeout);
      zoomTimeout = setTimeout(() => {
        if (!visNetwork) return;
        if (window._loadGraphRendering) return; //  loadGraph 진행 중엔 재렌더 생략 — "positions not initialized yet" 방지
        if (!isEgoMode && Object.keys(positions).length === 0) return;
        const skipMs = (typeof UX_CONFIG !== "undefined" && UX_CONFIG.zoomHandlerSkipMsAfterSelect) || 0;
        if (skipMs > 0 && Date.now() - lastNodeSelectionTime < skipMs) return; // 노드 클릭→드래그→다른 노드 클릭 시 이중 렌더·밀집 방지
        //  줌(-)/(+) 버튼 적용 안 되는 이슈 — setData()가 뷰를 리셋하므로 복원
        const savedScale = getScaleSafe(visNetwork);
        const savedPosition =
          typeof visNetwork.getViewPosition === "function"
            ? visNetwork.getViewPosition()
            : null;
        const currentPhysics = physicsEnabledState;
        renderGraph();
        // Physics 상태 복원 (안정화 완료 후에는 false 유지)
        if (!currentPhysics && visNetwork) {
          visNetwork.setOptions({ physics: false });
          physicsEnabledState = false; // 상태 추적 업데이트
        }
        // 줌 버튼/휠로 변경한 scale·position 유지 (setData 후 뷰 리셋 방지)
        if (
          savedPosition != null &&
          typeof visNetwork.moveTo === "function"
        ) {
          requestAnimationFrame(() => {
            if (visNetwork)
              visNetwork.moveTo({
                scale: savedScale,
                position: savedPosition,
                animation: false,
              });
          });
        }
      }, 150); // 150ms 디바운싱
    });
    visNetwork._zoomHandlerAdded = true; // 중복 이벤트 리스너 방지
  }
  try {
    if (visNetwork) {
      //  노드→다른 노드 클릭(드래그 유무 무관) 시 setData가 뷰를 리셋해 밀집처럼 보이는 것 방지 — 저장/복원
      const preserveView = !window._loadGraphRendering;
      let savedScale = null;
      let savedPosition = null;
      if (preserveView && typeof visNetwork.getScale === "function") {
        savedScale = getScaleSafe(visNetwork);
        if (typeof visNetwork.getViewPosition === "function") {
          savedPosition = visNetwork.getViewPosition();
        }
      }
      //  기존 인스턴스 업데이트
      visNetwork.setData(data);
      //  노드 클릭 시 physics 재활성화 방지 — 포커스 유지·화면 유동성 제거)
      const opts =
        !isEgoMode && !physicsEnabledState
          ? { ...options, physics: false }
          : options;
      visNetwork.setOptions(opts);
      if (isEgoMode) {
        physicsEnabledState = false;
        return;
      }
      //  loadGraph(초기 랜딩·전체 그래프 복귀) 후 렌더 시 physics 재활성화 억제 — 밀집 재현 방지
      if (window._loadGraphRendering) {
        visNetwork.setOptions({ physics: false });
        physicsEnabledState = false;
        window._loadGraphRendering = false;
        return;
      }
      //  빈 공간 클릭 시 physics 재활성화 방지 — 이미 안정된 레이아웃이 한 덩어리로 붙는 이슈 해결
      const shouldReenablePhysics =
        !selectedNodeId && physicsEnabledState;
      if (shouldReenablePhysics) {
        visNetwork.setOptions({ physics: true });
        physicsEnabledState = true;
      }
      if (preserveView && savedPosition != null && savedScale != null && typeof visNetwork.moveTo === "function") {
        requestAnimationFrame(() => {
          if (visNetwork)
            visNetwork.moveTo({
              scale: savedScale,
              position: savedPosition,
              animation: false,
            });
        });
      }
    } else {
      //  새 인스턴스 생성 (이벤트 리스너는 setupVisNetworkEvents에서 한 번만 등록)
      visNetwork = new vis.Network(container, data, options);
      physicsEnabledState = true; // 초기 상태는 physics 활성화 (options에서 physics: true)
      setupVisNetworkEvents(visNetwork);
      // 초기 렌더링은 options에서 이미 physics: true로 설정됨
    }
  } catch (err) {
    console.error("Vis.js network creation failed:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack,
      options: JSON.stringify(options, null, 2),
    });
    updateStatus("그래프 렌더링 실패 - 페이지를 새로고침해주세요", false);
    hideGraphLoading();
    //  에러 발생 시 인스턴스 초기화 (재시도 가능하도록)
    visNetwork = null;
    visNetworkEventsSetup = false;
  }
  // 클러스터링: 같은 타입의 노드들을 그룹화 (선택적, 향후 확장)
  // visNetwork.clusterByConnection() 또는 visNetwork.cluster() 사용 가능
}

function renderGraph() {
  if (NODES.length === 0) return;
  // 지배구조 맵(ego)은 Vis.js hierarchical이 위치를 계산하므로 positions 불필요
  if (!isEgoMode && Object.keys(positions).length === 0) {
    console.warn("renderGraph: positions not initialized yet");
    return;
  }
  renderGraphWithVisJs();
}

//  Vis.js 단일 체제 - 줌 기능을 Vis.js Network API로 연결
function setupZoomControls() {
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const zoomFitBtn = document.getElementById("zoomFit");
  const resetViewBtn = document.getElementById("resetViewBtn");

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      if (visNetwork) {
        try {
          const scale = getScaleSafe(visNetwork);
          visNetwork.moveTo({ scale: Math.min(3, scale * 1.2) });
        } catch (e) {
          console.warn("Zoom in failed:", e);
        }
      } else {
        console.warn("Graph not initialized yet");
      }
    };
  }

  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      if (visNetwork) {
        try {
          const scale = getScaleSafe(visNetwork);
          visNetwork.moveTo({ scale: Math.max(0.3, scale * 0.85) });
        } catch (e) {
          console.warn("Zoom out failed:", e);
        }
      } else {
        console.warn("Graph not initialized yet");
      }
    };
  }

  if (zoomFitBtn) {
    zoomFitBtn.onclick = () => {
      if (visNetwork) {
        try {
          visNetwork.fit({
            animation: { duration: 300, easingFunction: "easeInOutQuad" },
          });
        } catch (e) {
          console.warn("Fit to view failed:", e);
        }
      } else {
        console.warn("Graph not initialized yet");
      }
    };
  }

  if (resetViewBtn) {
    resetViewBtn.onclick = () => {
      //  ego 모드면 로고 클릭과 동일하게 전체 그래프로 복귀 (일관된 “초기화” 동작)
      if (isEgoMode) {
        resetToHome();
        return;
      }
      //  비-ego 시 재렌더 없이 선택 해제·뷰 fit만 적용 — 초기화 클릭 후 밀집 재현 방지
      selectedNode = null;
      selectedNodeId = null;
      connectedNodeIds.clear();
      if (visNetwork) {
        try {
          visNetwork.unselectAll();
          clearSelectionVisualState(visNetwork);
          visNetwork.fit({ animation: { duration: 300 } });
        } catch (e) {
          console.warn("Reset view failed:", e);
        }
      }
      showEmptyPanel(true);
      updateStatus("전체 그래프로 늘어났습니다", true);
    };
  }
}

// Ego 그래프 에러 재시도: 이벤트 위임으로 한 곳에서만 처리 (중복 리스너 방지)
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-retry") && e.target.dataset.action === "retry-ego-graph") {
    const nodeId = e.target.dataset.nodeId;
    if (nodeId) {
      e.preventDefault();
      loadEgoGraph(nodeId);
    }
  }
});

// 초기화 시 줌 컨트롤 설정 (DOM 로드 후)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupZoomControls);
} else {
  setupZoomControls();
}

function showTooltip(n, e) {
  const related = EDGES.filter((ed) => ed.from === n.id || ed.to === n.id);
  const node = NODES.find((x) => x.id === n.id);
  const ratio = EDGES.find(
    (e) => (e.from === n.id || e.to === n.id) && e.ratio,
  )?.ratio;
  const ratioStr = formatRatio(ratio) !== "" ? ` · ${formatRatio(ratio)}%` : "";
  //  UX 개선 - 타 서비스 CSS와 호환 (opacity + visible 클래스)
  tooltip.innerHTML = `<span class="tt-name">${esc(n.label)}</span><span class="tt-type">${esc(n.sub)}${ratioStr} · 연결 ${related.length}개</span>`;
  tooltip.classList.add("visible");
  moveTooltip(e);
}
function moveTooltip(e) {
  const rect = document.getElementById("graphArea").getBoundingClientRect();
  let tx = e.clientX - rect.left + 12;
  let ty = e.clientY - rect.top - 8;
  if (tx + 210 > rect.width) tx -= 220;
  tooltip.style.left = tx + "px";
  tooltip.style.top = ty + "px";
}
//  UX 개선 - opacity 기반 전환 효과 (display 대신)
function hideTooltip() {
  if (tooltip) {
    tooltip.classList.remove("visible");
    tooltip.style.opacity = "0";
  }
}

//  노드 포커스(줌/패닝) 공통 로직 — 노드 클릭·검색 선택 시 재사용 (유지보수성·일관성)
function focusOnNode(nodeId) {
  if (!visNetwork || !nodeId) return;
  const run = () => {
    if (!visNetwork) return;
    try {
      visNetwork.focus(nodeId, {
        scale: 1.2,
        animation: {
          duration: 400,
          easingFunction: "easeInOutQuad",
        },
      });
    } catch (e) {
      console.warn("focusOnNode failed:", e);
    }
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(run, 80);
    });
  });
}

async function selectNode(n) {
  selectedNode = n;
  selectedNodeId = n.id;
  lastNodeSelectionTime = Date.now();

  //  다른 노드 클릭 시 항상 '노드 상세' 탭으로 전환 — AI 질문 탭에 있을 때도 상세가 바로 보이도록
  switchTabById("detail");

  if (visNetwork) {
    connectedNodeIds.clear();
    try {
      const connectedEdges = visNetwork.getConnectedEdges(n.id);
      connectedEdges.forEach((edgeId) => {
        const edge = visNetwork.body.data.edges.get(edgeId);
        if (edge) {
          if (nodeIdsEqual(edge.from, n.id)) connectedNodeIds.add(String(edge.to));
          if (nodeIdsEqual(edge.to, n.id)) connectedNodeIds.add(String(edge.from));
        }
      });
    } catch (e) {
      console.warn("Failed to get connected edges:", e);
    }
  }

  // 즉시 패널 표시(폴백): 클릭 직후 기본 정보로 체감 지연 제거
  renderNodeDetailFallback(n);

  const requestedNodeId = n.id;
  const detailPromise = loadNodeDetail(n.id);
  requestAnimationFrame(() => {
    renderGraph();
    //  renderGraph 직후 포커스 — 노드 포커스 안 됨·화면 유동적 이슈 방지 (physics 유지 후 뷰 이동)
    setTimeout(() => focusOnNode(n.id), 60);
  });
  const detail = await detailPromise;
  //  노드 클릭 → 드래그(패닝) → 다른 노드 클릭 시 이전 노드 상세가 늦게 도착해 패널 덮어쓰는 것 방지
  if (detail && nodeIdsEqual(selectedNodeId, requestedNodeId)) renderNodeDetail(detail);
  else if (!detail) updateNodeDetailLoadingMessage(LOADING_MESSAGES.nodeDetailLoadError);
}

//  진행도 메시지 갱신 — 서버 진행 이벤트 추가 시 여기만 확장)
function updateNodeDetailLoadingMessage(message) {
  const el = document.getElementById("nodeDetailLoadingHint");
  if (!el) return;
  const isError = message === LOADING_MESSAGES.nodeDetailLoadError;
  el.textContent = message;
  el.setAttribute("aria-busy", isError ? "false" : "true");
}

function renderNodeDetailFallback(n) {
  document.getElementById("panelEmpty").style.display = "none";
  const detail = document.getElementById("nodeDetail");
  detail.classList.add("visible");
  const color = getNodeColor(n);
  const badge = UI_STRINGS.nodeType[n.type] || n.type;
  const loadingMsg = LOADING_MESSAGES.nodeDetailLoading;
  detail.innerHTML = `
    <div class="nd-body">
      <div class="nd-header">
        <div class="nd-type-row">
          <span class="nd-type-badge" style="background:${color}18;color:${color};border:1px solid ${color}30;">
            ${badge}
          </span>
        </div>
        <div class="nd-name">${esc(n.label)}</div>
        <div class="nd-sub">${esc(n.sub || "")}</div>
      </div>
      <p class="nd-loading-hint" id="nodeDetailLoadingHint" aria-live="polite" aria-busy="true">
        <span class="nd-loading-spinner" aria-hidden="true"></span>${esc(loadingMsg)}
      </p>
    </div>
  `;

  const actionContainer = document.createElement("div");
  actionContainer.className = "nd-actions";
  actionContainer.innerHTML = `
    <button class="ego-map-btn anim" onclick="loadEgoGraph('${n.id}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
      ${esc(UI_STRINGS.nodeDetail.btnEgoMap)}
    </button>
    <button class="ask-context-btn anim" onclick="openChatWithContext('${n.id}', '${esc(n.label)}', '${n.type}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10V3a1 1 0 011-1h7a1 1 0 011 1v5a1 1 0 01-1 1H4L2 10z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/></svg>
      ${esc(UI_STRINGS.nodeDetail.btnAskAi)}
    </button>
  `;
  detail.appendChild(actionContainer);
}

async function renderNodeDetail(data) {
  document.getElementById("panelEmpty").style.display = "none";
  const detail = document.getElementById("nodeDetail");
  detail.classList.add("visible");

  const color = getNodeColor(data);
  const badge = UI_STRINGS.nodeType[data.type] || data.type;

  detail.innerHTML = `
    <div class="nd-body">
      <div class="nd-header">
        <div class="nd-type-row">
          <span class="nd-type-badge" style="background:${color}18;color:${color};border:1px solid ${color}30;">
            ${badge}
          </span>
        </div>
        <div class="nd-name">${esc(data.label)}</div>
        <div class="nd-sub">${esc(data.sub || "")}</div>
      </div>

    ${
      data.stats && data.stats.length > 0
        ? `
    <div class="nd-stats">
      ${data.stats
        .map(
          (s) => `
        <div class="nd-stat">
          <div class="nd-stat-val">${esc(s.val)}</div>
          <div class="nd-stat-key">${esc(s.key)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
    `
        : ""
    }

    ${
      data.related && data.related.length > 0
        ? `
    <div class="nd-section">
      <div class="nd-section-title">
        ${UI_STRINGS.nodeDetail.sectionRelated} (${data.related.length})
        ${data.related.length >= NODE_DETAIL_RELATED_MAX ? `<span class="nd-limit-hint" title="API 기준 최대 ${NODE_DETAIL_RELATED_MAX}개까지 표시">· 최대 ${NODE_DETAIL_RELATED_MAX}개</span>` : ""}
      </div>
      <div class="related-list" id="relatedList">
        ${data.related
          .slice(0, 3)
          .map(
            (r) => `
          <div class="related-item" onclick="selectNodeById('${String(r.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">
            <div class="ri-dot" style="background:${getNodeColor(r) || "#ccc"}"></div>
            <div class="ri-name">${esc(r.label)}</div>
            ${formatRatio(r.ratio) !== "" ? `<span class="ri-val">${formatRatio(r.ratio)}%</span>` : ""}
          </div>
        `,
          )
          .join("")}
        ${
          data.related.length > 3
            ? `
          <div class="related-item-more hidden" id="relatedMore">
            ${data.related
              .slice(3)
              .map(
                (r) => `
              <div class="related-item" onclick="selectNodeById('${String(r.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">
                <div class="ri-dot" style="background:${getNodeColor(r) || "#ccc"}"></div>
                <div class="ri-name">${esc(r.label)}</div>
                ${formatRatio(r.ratio) !== "" ? `<span class="ri-val">${formatRatio(r.ratio)}%</span>` : ""}
              </div>
            `,
              )
              .join("")}
          </div>
          ${
            data.related.length - 3 > 0
              ? `
            <button class="related-more-btn" onclick="toggleRelatedMore()">
              <span class="related-more-text">${UI_STRINGS.nodeDetail.more}</span>
              <span class="related-more-count">(${data.related.length - 3}개)</span>
              <svg class="related-more-icon" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M3 3l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          `
              : ""
          }
        `
            : ""
        }
      </div>
    </div>
    `
        : ""
    }

    ${
      data.props && Object.keys(data.props).length > 0
        ? `
    <div class="nd-section">
      <div class="nd-section-title">${UI_STRINGS.nodeDetail.sectionAttrs}</div>
      <div class="props-grid">
        ${(() => {
          //  노드 타입별 속성 필터링 및 중복 제거
          const hiddenProps = [
            "createdAt",
            "created_at",
            "updatedAt", // 날짜 필드 (UX 요청)
            "nameEmbedding", // 임베딩 벡터
          ];

          // 중복 제거 및 정규화
          const filtered = { ...data.props };

          // Company 노드: companyNameNormalized, biznoOriginal 제외
          if (data.type === "company") {
            if (filtered.companyName && filtered.companyNameNormalized) {
              if (
                String(filtered.companyName).toLowerCase() ===
                String(filtered.companyNameNormalized).toLowerCase()
              ) {
                delete filtered.companyNameNormalized;
              }
            }
            if (filtered.bizno && filtered.biznoOriginal) {
              delete filtered.bizno; // biznoOriginal만 표시 (하이픈 포함)
            }
          }

          // Stockholder 노드: stockNameNormalized, totalStockRatio 제외
          if (
            data.type === "person" ||
            data.type === "major" ||
            data.type === "institution"
          ) {
            if (filtered.stockName && filtered.stockNameNormalized) {
              if (
                String(filtered.stockName).toLowerCase() ===
                String(filtered.stockNameNormalized).toLowerCase()
              ) {
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
            if (
              filtered.shareholderType &&
              ["INSTITUTION", "CORPORATION"].includes(
                String(filtered.shareholderType).toUpperCase(),
              )
            ) {
              if (
                filtered.stockName &&
                filtered.companyName &&
                String(filtered.stockName).toLowerCase() ===
                  String(filtered.companyName).toLowerCase()
              ) {
                delete filtered.companyName; // stockName 우선 표시
              }
            }
          }

          // 빈 값 필터링
          const shouldShow = (key, value) => {
            if (hiddenProps.includes(key)) return false;
            if (value === null || value === undefined) return false;
            if (typeof value === "string" && value.trim() === "") return false;
            if (typeof value === "object" && Object.keys(value).length === 0)
              return false;
            return true;
          };

          return Object.entries(filtered)
            .filter(([k, v]) => shouldShow(k, v))
            .slice(0, 10)
            .map(
              ([k, v]) => `
              <div class="prop-row">
                <span class="prop-key">${esc(k)}</span>
                <span class="prop-val">${esc(String(v))}</span>
              </div>
            `,
            )
            .join("");
        })()}
      </div>
    </div>
    `
        : ""
    }
    </div>
  `;

  // UX: 액션 버튼을 nd-body 밖에 두어 패널 하단 고정 (레이아웃 시프트 방지)
  const actionContainer = document.createElement("div");
  actionContainer.className = "nd-actions";
  actionContainer.innerHTML = `
    <button class="ego-map-btn anim" onclick="loadEgoGraph('${data.id}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
      ${esc(UI_STRINGS.nodeDetail.btnEgoMap)}
    </button>
    <button class="ask-context-btn anim" onclick="openChatWithContext('${data.id}', '${esc(data.label)}', '${data.type}')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10V3a1 1 0 011-1h7a1 1 0 011 1v5a1 1 0 01-1 1H4L2 10z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/></svg>
      ${esc(UI_STRINGS.nodeDetail.btnAskAi)}
    </button>
  `;
  detail.appendChild(actionContainer);
}

function selectNodeById(id) {
  const n = NODES.find((x) => nodeIdsEqual(x.id, id));
  if (n) selectNode(n);
}

//  연결 노드 더보기 토글 (UX 개선)
function toggleRelatedMore() {
  const moreEl = document.getElementById("relatedMore");
  const btn =
    event?.target?.closest(".related-more-btn") ||
    document.querySelector(".related-more-btn");
  if (!moreEl || !btn) return;

  const textEl = btn.querySelector(".related-more-text");
  const countEl = btn.querySelector(".related-more-count");
  const iconEl = btn.querySelector(".related-more-icon");

  if (moreEl.classList.contains("hidden")) {
    moreEl.classList.remove("hidden");
    if (textEl) textEl.textContent = UI_STRINGS.nodeDetail.fold;
    if (countEl) countEl.style.display = "none";
    if (iconEl) {
      iconEl.style.transform = "rotate(180deg)";
    }
  } else {
    moreEl.classList.add("hidden");
    const count = parseInt(countEl?.textContent.match(/\d+/)?.[0] || "0");
    if (textEl) textEl.textContent = UI_STRINGS.nodeDetail.more;
    if (countEl) {
      countEl.textContent = `(${count}개)`;
      countEl.style.display = "inline";
    }
    if (iconEl) {
      iconEl.style.transform = "rotate(0deg)";
    }
  }
}

/**
 * 노드 상세 패널을 비우고 빈 상태 메시지를 표시.
 * @param {boolean} [skipRenderGraph=false] - true면 renderGraph() 호출 생략 (빈 공간 클릭 등 레이아웃 유지 시)
 */
function showEmptyPanel(skipRenderGraph = false) {
  document.getElementById("panelEmpty").style.display = "";
  document.getElementById("nodeDetail").classList.remove("visible");
  document.getElementById("nodeDetail").innerHTML = "";
  //  UX 패턴 - 선택 해제 시 dimming 효과 제거
  selectedNodeId = null;
  connectedNodeIds.clear();
  if (visNetwork) {
    visNetwork.unselectAll();
    if (!skipRenderGraph) renderGraph();
  }
}

/* ═══════════════════════════════════════════
   CHAT
═══════════════════════════════════════════ */
// UX: AI 질문 탭 기본 프롬프트/제안 (노드 미선택 시) — 일관성·유지보수용 단일 소스
const CHAT_DEFAULT_PLACEHOLDER = "자연어로 질문하세요 (예: 지분율 50% 이상 최대주주)";
//  컨텍스트 있을 때 문구 단일 소스 — 중복 제거·확장성
const CHAT_CONTEXT_PLACEHOLDER_TEMPLATE = (label) => `"${label}"에 대해 질문하세요...`;
const CHAT_CONTEXT_SUG_HEADER = "다음 질문을 선택하세요";
const CHAT_CONTEXT_SWITCHED_TEMPLATE = (label) => `컨텍스트가 ${label}로 변경되었습니다. 아래 대화는 이전 노드 기준일 수 있습니다.`;

//  AI 질문 예시 단일 소스 — 확장·유지보수·협업 (배열만 수정하면 HTML/렌더 동기화)
const CHAT_DEFAULT_SUGGESTIONS = [
  { q: "지분율 50% 이상인 최대주주 목록을 보여줘", label: "지분율 50% 이상 최대주주 목록" },
  { q: "우선주 보유 비중이 높은 회사 TOP 10을 보여줘", label: "우선주 보유 비중이 높은 회사 TOP 10" },
  { q: "2022년 등기임원 평균보수가 가장 높은 회사 TOP 5", label: "임원보수 TOP 5 (2022년)" },
  { q: "3개 이상 법인에 투자한 주주를 찾아줘", label: "다중 법인 투자 주주" },
];

const CHAT_DEFAULT_SUG_HTML = `
  <div style="font-size:12px;color:var(--text-3);margin-bottom:10px;">
    노드를 선택하거나 아래 질문을 눌러보세요
  </div>
  <div class="suggestions" id="globalSugs">
    ${CHAT_DEFAULT_SUGGESTIONS.map((s) => `<button class="sug-item" data-q="${esc(s.q)}">${esc(s.label)}</button>`).join("\n    ")}
  </div>
`;

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

// UX: AI 질문 탭 UI를 chatContext와 동기화 — 탭 전환/노드 변경 시 일관된 화면
function syncChatTabUI() {
  const ctxBar = document.getElementById("ctxBar");
  const ctxChip = document.getElementById("ctxChip");
  const chatInput = document.getElementById("chatInput");
  const sugState = document.getElementById("sugState");
  if (!ctxBar || !chatInput) return;

  if (!chatContext) {
    ctxBar.classList.add("util-hidden");
    ctxBar.removeAttribute("aria-label");
    chatInput.placeholder = CHAT_DEFAULT_PLACEHOLDER;
    if (sugState) {
      sugState.innerHTML = CHAT_DEFAULT_SUG_HTML;
      sugState.style.display = "";
      bindSugButtons(sugState);
    }
    return;
  }
  ctxBar.classList.remove("util-hidden");
  if (ctxChip) ctxChip.textContent = chatContext.label;
  ctxBar.setAttribute("aria-label", `현재 질문 컨텍스트: ${chatContext.label}`);
  chatInput.placeholder = CHAT_CONTEXT_PLACEHOLDER_TEMPLATE(chatContext.label);
  const sugs = CONTEXT_SUGGESTIONS[chatContext.type]?.({ label: chatContext.label }) || [];
  if (sugState) {
    sugState.innerHTML = `
      <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">${esc(CHAT_CONTEXT_SUG_HEADER)}</div>
      <div class="suggestions">
        ${sugs.map((q) => `<button class="sug-item" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>
    `;
    sugState.style.display = "";
    bindSugButtons(sugState);
  }
}

//  컨텍스트 전환 시 시스템 메시지로 혼동 방지 (S4), 단일 진입점으로 확장·협업 유지
function openChatWithContext(nodeId, label, type) {
  const wasDifferentContext = chatContext && chatContext.nodeId !== nodeId;
  const previousLabel = chatContext?.label;

  switchTabById("chat");
  chatContext = { nodeId, label, type };
  syncChatTabUI();

  if (wasDifferentContext && previousLabel) {
    const msgs = document.getElementById("chatMsgs");
    if (msgs) {
      const sysText = CHAT_CONTEXT_SWITCHED_TEMPLATE(label);
      const sysEl = document.createElement("div");
      sysEl.className = "msg system anim";
      sysEl.setAttribute("role", "status");
      sysEl.innerHTML = `<div class="msg-bubble">${esc(sysText)}</div>`;
      msgs.appendChild(sysEl);
      msgs.scrollTop = msgs.scrollHeight;
    }
  }
}

function clearContext() {
  chatContext = null;
  syncChatTabUI();
}

//  대화 이력 초기화 (컨텍스트 초과 에러 해결을 위한 명확한 UX)
async function resetChatHistory() {
  if (
    !confirm(
      "대화 이력을 초기화하시겠습니까? 이전 대화 내용은 복구할 수 없습니다.",
    )
  ) {
    return;
  }

  try {
    await apiCall("/api/v1/chat", {
      method: "DELETE",
    });

    const msgs = document.getElementById("chatMsgs");
    if (msgs) {
      const sugState = document.getElementById("sugState");
      if (sugState) {
        msgs.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.id = "sugState";
        wrap.className = "anim";
        wrap.innerHTML = CHAT_DEFAULT_SUG_HTML;
        msgs.appendChild(wrap);
        bindSugButtons(wrap);
      } else {
        msgs.innerHTML = `<div id="sugState" class="anim">${CHAT_DEFAULT_SUG_HTML}</div>`;
        bindSugButtons(msgs);
      }
    }

    chatContext = null;
    syncChatTabUI();

    // 사용자 피드백
    updateStatus("대화 이력이 초기화되었습니다", true);
  } catch (e) {
    console.error("대화 초기화 실패:", e);
    alert("대화 초기화에 실패했습니다. 페이지를 새로고침해주세요.");
  }
}

function bindSugButtons(container) {
  container.querySelectorAll(".sug-item").forEach((btn) => {
    btn.addEventListener("click", () => sendMessage(btn.dataset.q));
  });
}
bindSugButtons(document.getElementById("chatMsgs"));

async function sendMessage(q) {
  const msgs = document.getElementById("chatMsgs");
  const sugState = document.getElementById("sugState");
  if (sugState) sugState.style.display = "none";

  const contextLabel = chatContext ? chatContext.label : null;

  // 사용자 메시지 추가
  msgs.insertAdjacentHTML(
    "beforeend",
    `
    <div class="msg user anim">
      <div class="msg-bubble">${esc(q)}</div>
    </div>
  `,
  );

  const typingId = "typing-" + Date.now();
  msgs.insertAdjacentHTML(
    "beforeend",
    `
    <div class="msg ai" id="${typingId}">
      <div class="typing-bubble">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>
  `,
  );
  msgs.scrollTop = msgs.scrollHeight;

  let responseAdded = false; // 응답이 이미 추가되었는지 추적
  let isSending = false; // 중복 요청 방지

  if (isSending) {
    console.warn("이미 요청 중입니다.");
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

    const srcClass =
      data.source === "DB"
        ? "src-db"
        : data.source === "DB_EMPTY"
          ? "src-db-empty"
          : "src-llm";
    const srcLabel =
      data.source === "DB"
        ? "Neo4j 직접 조회"
        : data.source === "DB_EMPTY"
          ? "쿼리 실행, 결과 없음"
          : "추론 (환각 주의)";
    const srcIcon = data.source === "LLM" ? "⚠️ " : "● ";

    // AI 응답 추가 (한 번만). CTO: renderChatAnswer — esc 후 **...** → <strong> 안전 렌더
    const answerText = renderChatAnswer(data.answer || "답변을 생성하지 못했습니다.");
    msgs.insertAdjacentHTML(
      "beforeend",
      `
      <div class="msg ai anim">
        <div class="msg-bubble">${answerText}</div>
        <div style="display:flex;gap:5px;align-items:center;margin-top:4px;padding:0 4px;">
          <span class="src-tag ${srcClass}">${srcIcon}${srcLabel}</span>
          <span class="msg-meta">${data.elapsed}s</span>
          ${contextLabel ? `<span class="msg-meta">컨텍스트: ${esc(contextLabel)}</span>` : ""}
        </div>
      </div>
    `,
    );
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
    msgs.insertAdjacentHTML(
      "beforeend",
      `
      <div class="msg ai anim">
        <div class="msg-bubble" style="color:var(--pwc-red);">오류: ${esc(e.message)}</div>
      </div>
    `,
    );
    msgs.scrollTop = msgs.scrollHeight;
  } finally {
    isSending = false;
  }
}

let isSending = false; // 중복 전송 방지 플래그
let isComposing = false; // IME composition 상태 추적

function handleSend() {
  if (isSending || isComposing) return; // 전송 중이거나 composition 중이면 무시
  const v = document.getElementById("chatInput").value.trim();
  if (!v) return;
  document.getElementById("chatInput").value = "";
  isSending = true;
  sendMessage(v).finally(() => {
    isSending = false;
  });
}

document.getElementById("chatSend").addEventListener("click", handleSend);

//  대화 초기화 버튼 이벤트
const chatResetBtn = document.getElementById("chatResetBtn");
if (chatResetBtn) {
  chatResetBtn.addEventListener("click", resetChatHistory);
}

// IME composition 이벤트 처리 (한글 입력 완료 감지)
document
  .getElementById("chatInput")
  .addEventListener("compositionstart", () => {
    isComposing = true;
  });
document.getElementById("chatInput").addEventListener("compositionend", () => {
  isComposing = false;
});

document.getElementById("chatInput").addEventListener("keydown", (e) => {
  // IME composition 중이면 Enter 무시 (한글 입력 완료 전 방지)
  if (e.key === "Enter" && !e.shiftKey && !isComposing && !e.isComposing) {
    e.preventDefault();
    handleSend();
  }
});
document.getElementById("chatInput").addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 80) + "px";
});

/* ═══════════════════════════════════════════
   TABS & PANEL TOGGLE
═══════════════════════════════════════════ */
function switchTab(el) {
  const tab = el.dataset.tab;
  document.querySelectorAll(".ptab").forEach((t) => {
    t.classList.toggle("active", t === el);
    t.setAttribute("aria-selected", t === el ? "true" : "false");
  });
  const detailTab = document.getElementById("detailTab");
  const chatTab = document.getElementById("chatTab");
  const showDetail = tab === "detail";
  detailTab.classList.toggle("util-hidden", !showDetail);
  chatTab.classList.toggle("util-hidden", showDetail);
  if (detailTab) detailTab.setAttribute("aria-hidden", showDetail ? "false" : "true");
  if (chatTab) chatTab.setAttribute("aria-hidden", showDetail ? "true" : "false");
  if (tab === "chat") syncChatTabUI(); // UX: AI 질문 탭 진입 시 컨텍스트와 UI 동기화
}
function switchTabById(id) {
  const el = document.querySelector(`.ptab[data-tab="${id}"]`);
  if (el) switchTab(el);
}

let panelOpen = true;
function togglePanel() {
  const panel = document.getElementById("sidePanel");
  const btn = document.getElementById("panelToggle");
  panelOpen = !panelOpen;
  if (panelOpen) {
    panel.style.width = "var(--panel-w)";
    btn.innerHTML = `<svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M2 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn.style.left = "-20px"; // 사이드바 왼쪽 경계
  } else {
    panel.style.width = "0";
    btn.innerHTML = `<svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M6 2l-4 4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn.style.left = "0"; // 그래프 영역 오른쪽 경계
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
  Object.keys(nodeCounts).forEach((type) => {
    const countEl = document.querySelector(
      `.legend-count[data-count-type="${type}"]`,
    );
    if (countEl) {
      const count = nodeCounts[type] || 0;
      countEl.textContent = `${count.toLocaleString()}${UI_STRINGS.legend.countSuffix}`;
    }
  });
}

async function toggleFilter(el) {
  const pill = el?.closest?.(".filter-pill") || el;
  const f = pill?.dataset?.filter;
  if (f == null || !GRAPH_CONFIG.nodeTypes.includes(f)) return;
  if (activeFilters.has(f)) {
    if (activeFilters.size > 1) {
      activeFilters.delete(f);
      pill.classList.remove("active");
    }
  } else {
    activeFilters.add(f);
    pill.classList.add("active");
  }

  //  필터 변경 시 모든 활성 필터 노드 표시 (노드 타입 정규화로 API 대소문자 차이 흡수)
  const visibleNodes = NODES.filter((n) =>
    activeFilters.has(canonicalNodeType(n.type)),
  );
  //  개발 환경에서만 필터 변경 로그 출력
  const isDevelopment =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.protocol === "file:";
  if (isDevelopment) {
    console.debug("필터 변경:", {
      filter: f,
      activeFilters: Array.from(activeFilters),
      visibleNodes: visibleNodes.length,
      timestamp: new Date().toISOString(),
    });
  }

  if (visibleNodes.length === 0) {
    console.warn(
      "필터 적용 후 표시할 노드가 없습니다. 모든 필터가 비활성화되었습니다.",
    );
    updateStatus(UI_STRINGS.filter.minOneType, false);
    // 필터를 다시 활성화하여 빈 그래프 방지
    activeFilters.add(f);
    pill.classList.add("active");
    return;
  }

  selectedNodeId = null;
  connectedNodeIds.clear();
  if (visNetwork) visNetwork.unselectAll();

  //  필터 on/off 시 밀집 방지 — physics 재활성화 제거, initPositions 후 1회만 렌더
  if (!isEgoMode) await initPositions();
  renderGraph();
  showEmptyPanel(true); //  이중 렌더 방지 (위 renderGraph만 사용)
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
//  지배구조 맵(ego) 시 검색 결과가 서버 API 기준이면 true — 클릭 시 해당 노드 ego로 전환
let searchResultsFromApi = false;

const SEARCH_SUGGESTION_LIMIT = 10;
const SEARCH_API_LIMIT = 15;

//  서버 검색 단일 진입점 — 홈/지배구조 맵(ego) 공통, 확장성·유지보수
function searchViaApi(q) {
  searchResultsFromApi = true;
  showSearchLoading();
  apiCall(
    `/api/v1/graph/nodes?search=${encodeURIComponent(q)}&limit=${SEARCH_API_LIMIT}`,
  )
    .then((res) => {
      const nodes = (res?.nodes || []).slice(0, SEARCH_SUGGESTION_LIMIT);
      searchResults = nodes;
      if (nodes.length === 0) {
        showSearchNoResults();
      } else {
        showSearchResults(nodes, q.toLowerCase(), true);
      }
    })
    .catch(() => {
      searchResultsFromApi = false;
      showSearchNoResults();
    });
}

function performSearch(query) {
  if (!query || query.trim().length === 0) {
    searchResultsFromApi = false;
    clearSearchHighlight();
    hideSearchResults();
    renderGraph();
    return;
  }

  const q = query.trim();
  selectedSearchIndex = -1;
  const qLower = q.toLowerCase();

  //  지배구조 맵(ego) 또는 홈에서 로컬 데이터 없음/매칭 없음 → 서버 검색 (홈/노드 클릭 시 검색 안 되는 이슈 대응)
  const useApiOnly = isEgoMode;
  const noLocalData = NODES.length === 0;
  const localResults = noLocalData
    ? []
    : NODES.filter(
        (n) =>
          n.label.toLowerCase().includes(qLower) ||
          (n.sub && n.sub.toLowerCase().includes(qLower)),
      ).slice(0, SEARCH_SUGGESTION_LIMIT);

  if (useApiOnly || noLocalData || localResults.length === 0) {
    searchViaApi(q);
    return;
  }

  searchResultsFromApi = false;
  searchResults = localResults;
  showSearchResults(localResults, qLower, false);
  highlightSearchResults(localResults);
}

function showSearchLoading() {
  const resultsEl = document.getElementById("searchResults");
  if (!resultsEl) return;
  resultsEl.innerHTML = `
    <div class="search-no-results" style="color:var(--text-3);">검색 중...</div>
  `;
  resultsEl.classList.remove("hidden");
}

function highlightSearchResults(results) {
  // Vis.js에서 노드 하이라이트 — focusOnNode로 포커스 통일 (타이밍/스케일 일관성)
  if (visNetwork && results.length > 0) {
    const nodeIds = results.map((n) => n.id);
    visNetwork.selectNodes(nodeIds);
    if (results.length > 0) {
      focusOnNode(results[0].id);
    }
  }
}

function clearSearchHighlight() {
  if (visNetwork) {
    visNetwork.unselectAll();
  }
}

function highlightMatch(text, query) {
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  return esc(text).replace(
    regex,
    '<mark style="background: var(--pwc-orange); color: white; padding: 0 2px;">$1</mark>',
  );
}

function showSearchResults(results, query, fromApi = false) {
  const resultsEl = document.getElementById("searchResults");
  if (!resultsEl) return;

  const typeLabels = UI_STRINGS.nodeType;
  resultsEl.innerHTML = results
    .map((node, idx) => {
      const label = highlightMatch(node.label || "", query);
      const typeLabel = typeLabels[node.type] || node.type || "";
      return `
      <div class="search-result-item ${idx === selectedSearchIndex ? "selected" : ""}" 
           data-node-id="${esc(node.id)}" 
           data-index="${idx}"
           data-from-api="${fromApi ? "1" : "0"}">
        <div class="search-result-label">${label}</div>
        <div class="search-result-type">${typeLabel}</div>
      </div>
    `;
    })
    .join("");

  resultsEl.classList.remove("hidden");

  resultsEl.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const nodeId = item.dataset.nodeId;
      const fromApiClick = item.dataset.fromApi === "1";
      if (fromApiClick) {
        loadEgoGraph(nodeId).then(() => {
          hideSearchResults();
          const searchInput = document.getElementById("nodeSearch");
          if (searchInput) searchInput.value = "";
        });
        searchResultsFromApi = false;
        return;
      }
      const node = NODES.find((n) => nodeIdsEqual(n.id, nodeId));
      if (node) {
        selectNode(node); // 내부에서 renderGraph + focusOnNode 호출 (일관된 타이밍·라벨 표시)
        hideSearchResults();
        const searchInput = document.getElementById("nodeSearch");
        if (searchInput) searchInput.value = "";
      }
    });
  });
}

function showSearchNoResults() {
  const resultsEl = document.getElementById("searchResults");
  if (!resultsEl) return;

  resultsEl.innerHTML = `
    <div class="search-no-results">
      검색 결과가 없습니다
    </div>
  `;
  resultsEl.classList.remove("hidden");
}

function hideSearchResults() {
  const resultsEl = document.getElementById("searchResults");
  if (resultsEl) {
    resultsEl.classList.add("hidden");
  }
}

function updateSearchSelection() {
  const resultsEl = document.getElementById("searchResults");
  if (!resultsEl) return;

  resultsEl.querySelectorAll(".search-result-item").forEach((item, idx) => {
    item.classList.toggle("selected", idx === selectedSearchIndex);
  });
}

function setupSearch() {
  const searchInput = document.getElementById("nodeSearch");
  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    const query = this.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });

  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (searchResults.length > 0) {
        selectedSearchIndex = Math.min(
          selectedSearchIndex + 1,
          searchResults.length - 1,
        );
        updateSearchSelection();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedSearchIndex = Math.max(selectedSearchIndex - 1, -1);
      updateSearchSelection();
    } else if (
      e.key === "Enter" &&
      selectedSearchIndex >= 0 &&
      searchResults[selectedSearchIndex]
    ) {
      e.preventDefault();
      const node = searchResults[selectedSearchIndex];
      if (searchResultsFromApi) {
        loadEgoGraph(node.id).then(() => {
          hideSearchResults();
          this.value = "";
        });
        searchResultsFromApi = false;
        return;
      }
      selectNode(node); // 내부에서 renderGraph + focusOnNode 호출
      hideSearchResults();
      this.value = "";
    } else if (e.key === "Escape") {
      hideSearchResults();
      this.value = "";
      clearSearchHighlight();
      renderGraph();
    }
  });

  // 검색창 외부 클릭 시 드롭다운 닫기
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) {
      hideSearchResults();
    }
  });
}

/* ═══════════════════════════════════════════
   UTIL
═══════════════════════════════════════════ */
function esc(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

//  AI 답변용 — esc 후 **...** 만 <strong>으로 렌더 (XSS 방지 유지, 확장 시 서브셋 추가 가능)
function renderChatAnswer(text) {
  if (text == null || text === "") return "";
  const escaped = esc(text);
  return escaped.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
//  resize 이벤트 최적화 - Vis.js가 자동으로 처리하므로 불필요한 initPositions 제거
window.addEventListener("resize", () => {
  if (visNetwork) {
    //  Vis.js가 자동으로 리사이즈 처리, redraw()로 강제 갱신
    try {
      visNetwork.redraw();
    } catch (e) {
      console.warn("Resize redraw failed:", e);
      // 폴백: 전체 재렌더링
      renderGraph();
    }
  }
});

// 로고 클릭 시 홈. ego 모드면 전체 그래프 재로드 후 fit
function resetToHome() {
  const searchInput = document.getElementById("nodeSearch");
  if (searchInput) {
    searchInput.value = "";
    hideSearchResults();
    clearSearchHighlight();
  }

  selectedNode = null;
  selectedNodeId = null;
  connectedNodeIds.clear();

  activeFilters = new Set(GRAPH_CONFIG.nodeTypes);
  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.classList.add("active");
  });

  //  지배구조 맵(ego) 보기 후 로고 클릭 시 전체 그래프로 복귀
  if (isEgoMode) {
    isEgoMode = false;
    egoCenterId = null;
    const banner = document.getElementById(GOV_MAP_IDS.banner);
    if (banner) banner.classList.add("util-hidden");
    loadGraph().then(() => {
      if (visNetwork) {
        visNetwork.unselectAll();
        let fitDone = false;
        const doFit = () => {
          if (fitDone || !visNetwork) return;
          fitDone = true;
          try {
            visNetwork.fit({ animation: { duration: 300 } });
          } catch (e) {
            console.warn("resetToHome fit failed:", e);
          }
        };
        visNetwork.once("stabilizationIterationsDone", doFit);
        setTimeout(doFit, 550);
      }
      showEmptyPanel();
      updateStatus("홈으로 이동했습니다", true);
    });
    return;
  }

  //  비-ego 시 저장된 positions로 레이아웃 재적용 후 fit — 로고 클릭 후 밀집 상태 복구 (일관성·확장성)
  if (visNetwork && NODES.length > 0 && Object.keys(positions).length > 0) {
    visNetwork.unselectAll();
    clearSelectionVisualState(visNetwork);
    renderGraph(); // 저장된 레이아웃 재적용 (physics 미재활성화로 밀집 유발 없음)
    let fitDone = false;
    const doFit = () => {
      if (fitDone || !visNetwork) return;
      fitDone = true;
      try {
        visNetwork.fit({ animation: { duration: 300 } });
      } catch (e) {
        console.warn("resetToHome fit failed:", e);
      }
    };
    visNetwork.once("stabilizationIterationsDone", doFit);
    setTimeout(doFit, 550);
  } else if (visNetwork) {
    visNetwork.unselectAll();
    clearSelectionVisualState(visNetwork);
    try {
      visNetwork.fit({ animation: { duration: 300 } });
    } catch (e) {
      console.warn("resetToHome fit failed:", e);
    }
  }

  showEmptyPanel(true);
  updateStatus("홈으로 이동했습니다", true);
}

//  범례/노드 유형 라벨을 UI_STRINGS와 동기화 (단일 소스, 하드코딩 제거)
function syncLegendLabels() {
  const titleEl = document.querySelector(".legend-title");
  if (titleEl) titleEl.textContent = UI_STRINGS.legend.title;
  GRAPH_CONFIG.nodeTypes.forEach((type) => {
    const row = document.querySelector(`.legend-row[data-count-type="${type}"]`);
    const labelEl = row?.querySelector(".legend-label");
    if (labelEl) labelEl.textContent = UI_STRINGS.nodeType[type] || type;
  });
}

//  탭·필터·빈 패널·지배구조 맵 버튼 문구를 UI_STRINGS와 동기화·협업)
function syncPanelTabLabels() {
  document.querySelectorAll(".ptab[data-tab]").forEach((el) => {
    const key = el.getAttribute("data-tab");
    if (key && UI_STRINGS.tabs[key]) el.textContent = UI_STRINGS.tabs[key];
  });
}

function syncFilterLabels() {
  document.querySelectorAll(".filter-pill[data-filter]").forEach((el) => {
    const key = el.getAttribute("data-filter");
    const labelEl = el.querySelector(".filter-label");
    if (labelEl && key) labelEl.textContent = UI_STRINGS.nodeType[key] || key;
  });
}

function syncPanelEmptyLabels() {
  const wrap = document.getElementById("panelEmpty");
  if (!wrap) return;
  const p = wrap.querySelector("p");
  const span = wrap.querySelector("span");
  const s = UI_STRINGS.panelEmpty;
  if (p) p.innerHTML = `${esc(s.title)}<br/>${esc(s.titleBr)}`;
  if (span) span.textContent = s.hint;
}

function syncEgoBannerButtonLabels() {
  const egoBtn = document.getElementById(GOV_MAP_IDS.btnEgo);
  const exitBtn = document.querySelector(".ego-exit-btn");
  const heatBtn = document.getElementById(GOV_MAP_IDS.btnHeatmap);
  const labelEl = document.getElementById(GOV_MAP_IDS.bannerLabel);
  if (egoBtn) egoBtn.textContent = UI_STRINGS.govMap.btnEgo;
  if (exitBtn) exitBtn.textContent = UI_STRINGS.govMap.btnExit;
  if (heatBtn) heatBtn.textContent = UI_STRINGS.govMap.btnHeatmap;
  if (labelEl) labelEl.textContent = UI_STRINGS.govMap.label;
}

//  모든 UI 문구를 UI_STRINGS와 동기화 (탭·필터·범례·빈 패널·지배구조 맵)
function syncAllUILabels() {
  syncLegendLabels();
  syncPanelTabLabels();
  syncFilterLabels();
  syncPanelEmptyLabels();
  syncEgoBannerButtonLabels();
}

//  Vis.js 라이브러리 로드 확인 후 loadGraph 실행 (초기화)
function waitForVisJs(maxAttempts = 20, interval = 100) {
  if (typeof vis !== "undefined" && vis.Network) {
    syncAllUILabels();
    loadGraph();
    // UX: 검색 및 로고 이벤트 설정
    setupSearch();
    setupLogoHome();
    return;
  }
  if (maxAttempts <= 0) {
    console.error("Vis.js failed to load after timeout");
    updateStatus(
      "Vis.js 라이브러리 로드 실패 - 페이지를 새로고침해주세요",
      false,
    );
    hideGraphLoading();
    syncAllUILabels();
    setupSearch();
    setupLogoHome();
    return;
  }
  setTimeout(() => waitForVisJs(maxAttempts - 1, interval), interval);
}

function setupLogoHome() {
  const logoHome = document.getElementById("logoHome");
  if (logoHome) {
    logoHome.addEventListener("click", resetToHome);
    logoHome.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        resetToHome();
      }
    });
  }
}

// DOM 로드 후 Vis.js 확인
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => waitForVisJs());
} else {
  waitForVisJs();
}
