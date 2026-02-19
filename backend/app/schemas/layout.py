"""레이아웃 API 요청/응답 스키마 (협업: 프론트-백엔드 계약)."""
from typing import Any

from pydantic import BaseModel, Field


class LayoutRequest(BaseModel):
    """POST /graph/layout 요청. 노드/엣지와 선택 옵션."""

    nodes: list[dict[str, Any]] = Field(..., description="노드 목록, 각 항목에 id 필수")
    edges: list[dict[str, Any]] = Field(..., description="엣지 목록, from, to, ratio 필드")
    width: float = Field(1.0, ge=0.1, le=2.0, description="정규화 캔버스 너비 (반환 좌표 스케일)")
    height: float = Field(1.0, ge=0.1, le=2.0, description="정규화 캔버스 높이")
    padding: float = Field(0.05, ge=0, le=0.2)
    use_components: bool = Field(True, description="연결 요소별 그리드 배치 여부")
    engine: str = Field("networkx", description="레이아웃 엔진: networkx(기본) 또는 pygraphviz(고품질, Graphviz 필요)")


class LayoutResponse(BaseModel):
    """레이아웃 API 응답. 0~1 정규화 좌표."""

    positions: dict[str, dict[str, float]] = Field(..., description='노드 id -> { "x", "y" } (0~1)')
    components: list[list[str]] = Field(default_factory=list, description="연결 요소별 노드 id 리스트")
