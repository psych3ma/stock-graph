"""
그래프 레이아웃 서비스 (협업·Production 수준).

지원 엔진:
- NetworkX: Kamada-Kawai → Spring 2단계 (기본, Graphviz 불필요)
- PyGraphviz: Graphviz 기반 고품질 레이아웃 (선택, Graphviz 시스템 라이브러리 필요)

진단: "털뭉치" 방지
- MultiDiGraph 함정: 동일 (u,v) 다중 엣지를 그대로 쓰면 스프링이 N배로 강해져 노드가 착 달라붙음.
  → 레이아웃용으로는 **단순 무방향 Graph**, 노드 쌍당 엣지 1개(weight=대표 ratio)만 사용.
- k 파라미터: 노드 수에 따른 동적 k = 5.0/√n 으로 적정 거리 확보.
- 결정론적: seed=42 고정으로 동일 데이터는 항상 동일 레이아웃 (협업/공유 시 필수).

파이프라인: 입력 정제 → 단순 그래프 생성 → 레이아웃 엔진(NetworkX/PyGraphviz) → 0~1 정규화.
"""
import math
import logging
from typing import Any, Literal

import networkx as nx

logger = logging.getLogger(__name__)

try:
    import pygraphviz as pgv
    from networkx.drawing.nx_agraph import to_agraph
    HAS_PYGRAPHVIZ = True
except ImportError:
    HAS_PYGRAPHVIZ = False
    logger.info("PyGraphviz not available, using NetworkX only")

# 협업: 동일 데이터면 항상 같은 모양. 시드 고정.
LAYOUT_SEED = 42


def _build_layout_graph(nodes: list[dict], edges: list[dict]) -> nx.Graph:
    """
    레이아웃 전용 단순 무방향 그래프 생성.
    동일 (from, to) 다중 엣지는 1개로 합치고, weight는 max(ratio) 사용 (높은 지분 = 가까이).
    """
    G = nx.Graph()
    for i, n in enumerate(nodes):
        nid = n.get("id") or f"n{i}"
        G.add_node(nid)
    node_ids = set(G.nodes())
    # (u,v) 쌍당 하나의 엣지만. weight = 해당 쌍의 max(ratio)
    pair_weight: dict[tuple[str, str], float] = {}
    for e in edges:
        u, v = e.get("from"), e.get("to")
        if not u or not v or u not in node_ids or v not in node_ids:
            continue
        key = (min(u, v), max(u, v))
        ratio = max(0.1, min(100.0, float(e.get("ratio") or 0)))
        pair_weight[key] = max(pair_weight.get(key, 0), ratio)
    for (u, v), w in pair_weight.items():
        G.add_edge(u, v, weight=w)
    return G


def _normalize_positions(
    pos: dict[str, tuple[float, float]],
    padding: float,
) -> dict[str, dict[str, float]]:
    """좌표를 [padding, 1-padding] 범위로 정규화 (Frontend 0~1 계약)."""
    if not pos:
        return {}
    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max_x - min_x or 1.0
    span_y = max_y - min_y or 1.0
    inner = 1.0 - 2 * padding
    out = {}
    for nid, (x, y) in pos.items():
        out[nid] = {
            "x": padding + (x - min_x) / span_x * inner,
            "y": padding + (y - min_y) / span_y * inner,
        }
    return out


def _layout_with_pygraphviz(
    G: nx.Graph,
    scale: float = 1.0,
) -> dict[str, tuple[float, float]]:
    """
    PyGraphviz 기반 레이아웃 (고품질, overlap=scale로 라벨 겹침 방지).
    Graphviz 시스템 라이브러리 필요. 없으면 NetworkX로 폴백.
    """
    if not HAS_PYGRAPHVIZ:
        raise ImportError("PyGraphviz not available")
    n = G.number_of_nodes()
    if n == 0:
        return {}
    if n == 1:
        return {list(G.nodes())[0]: (0.0, 0.0)}
    try:
        A = to_agraph(G)
        # CTO 전략: neato 엔진 + overlap=false (결정론적) + sep=+20 (라벨 겹침 방지 강화)
        A.graph_attr.update(overlap="false", splines="true", sep="+20")
        A.layout(prog="neato")
        pos = {}
        for node in A.nodes():
            nid = node.get_name()
            pos_str = node.attr.get("pos", "0,0")
            parts = pos_str.split(",")
            if len(parts) >= 2:
                x, y = float(parts[0]), float(parts[1])
                pos[nid] = (x, y)
            else:
                pos[nid] = (0.0, 0.0)
        return pos
    except Exception as ex:
        logger.warning("PyGraphviz layout failed: %s, falling back to NetworkX", ex)
        raise


def _layout_one_graph(
    G: nx.Graph,
    scale: float = 1.0,
    seed: int = LAYOUT_SEED,
    engine: Literal["networkx", "pygraphviz"] = "networkx",
) -> dict[str, tuple[float, float]]:
    """
    레이아웃 엔진 선택:
    - pygraphviz: Graphviz 기반 (고품질, overlap=scale)
    - networkx: Kamada-Kawai → Spring 2단계 (기본, 폴백)
    """
    if engine == "pygraphviz" and HAS_PYGRAPHVIZ:
        try:
            return _layout_with_pygraphviz(G, scale=scale)
        except Exception:
            logger.info("PyGraphviz failed, using NetworkX")
            engine = "networkx"
    n = G.number_of_nodes()
    if n == 0:
        return {}
    if n == 1:
        return {list(G.nodes())[0]: (0.0, 0.0)}
    k_val = 5.0 / math.sqrt(n)
    try:
        pos = nx.kamada_kawai_layout(G, scale=scale)
    except Exception as ex:
        logger.warning("kamada_kawai_layout failed: %s, using circular", ex)
        pos = nx.circular_layout(G, scale=scale)
    try:
        pos = nx.spring_layout(G, pos=pos, k=k_val, iterations=30, threshold=1e-4, seed=seed)
    except Exception as ex:
        logger.warning("spring_layout refine failed: %s", ex)
    return pos


def compute_layout(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    width: float = 1.0,
    height: float = 1.0,
    padding: float = 0.05,
    use_components: bool = True,
    engine: Literal["networkx", "pygraphviz"] = "networkx",
) -> dict[str, Any]:
    """
    노드/엣지 리스트 → 단순 그래프 → Kamada-Kawai → Spring → 0~1 정규화.

    Args:
        nodes: [ {"id": "n1", "type": "...", ...}, ... ]
        edges: [ {"from": "n1", "to": "n2", "ratio": 50.0}, ... ] (동일 쌍 다중 가능)
        padding: 여백 비율. 반환 좌표는 [padding, 1-padding].
        use_components: True면 연결 요소별로 레이아웃 후 그리드 배치.

    Returns:
        { "positions": { "n1": {"x": 0.2, "y": 0.5}, ... }, "components": [ ["n1","n2"], ... ] }
    """
    if not nodes:
        return {"positions": {}, "components": []}

    if not edges:
        # 노드만: 균등 원형, 결정론적 (seed 역할으로 인덱스 순서 고정)
        positions = {}
        comp_list = []
        for i, n in enumerate(nodes):
            nid = n.get("id") or f"n{i}"
            angle = (i / max(len(nodes), 1)) * 2 * math.pi
            positions[nid] = {
                "x": 0.5 + 0.35 * math.cos(angle),
                "y": 0.5 + 0.35 * math.sin(angle),
            }
            comp_list.append([nid])
        return {"positions": positions, "components": comp_list}

    G_layout = _build_layout_graph(nodes, edges)
    components = list(nx.connected_components(G_layout))
    components = [list(c) for c in sorted(components, key=len, reverse=True)]

    positions: dict[str, dict[str, float]] = {}

    if use_components and len(components) > 1:
        n_comp = len(components)
        n_cols = math.ceil(math.sqrt(n_comp))
        n_rows = math.ceil(n_comp / n_cols)
        cell_w = (1.0 - 2 * padding) / n_cols
        cell_h = (1.0 - 2 * padding) / n_rows
        for idx, comp in enumerate(components):
            sub = G_layout.subgraph(comp).copy()
            pos_sub = _layout_one_graph(sub, scale=1.0, seed=LAYOUT_SEED, engine=engine)
            pos_norm = _normalize_positions(pos_sub, padding=0.0)
            row, col = idx // n_cols, idx % n_cols
            ox = padding + col * cell_w
            oy = padding + row * cell_h
            for nid, p in pos_norm.items():
                positions[nid] = {
                    "x": ox + p["x"] * cell_w,
                    "y": oy + p["y"] * cell_h,
                }
    else:
        pos_raw = _layout_one_graph(G_layout, scale=1.0, seed=LAYOUT_SEED, engine=engine)
        pos_norm = _normalize_positions(pos_raw, padding=padding)
        positions.update(pos_norm)

    for n in nodes:
        nid = n.get("id")
        if nid and nid not in positions:
            positions[nid] = {"x": 0.5, "y": 0.5}

    return {"positions": positions, "components": components}
