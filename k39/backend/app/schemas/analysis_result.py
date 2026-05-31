from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from pydantic import BaseModel, ConfigDict


class AnalysisResultBase(BaseModel):
    match_id: int
    analysis_type: str
    data: Dict[str, Any]


class AnalysisResultCreate(AnalysisResultBase):
    pass


class AnalysisResult(AnalysisResultBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class PossessionData(BaseModel):
    home_team: float
    away_team: float
    by_period: Optional[Dict[str, Dict[str, float]]] = None


class PassNode(BaseModel):
    player_id: int
    name: Optional[str] = None
    team: str
    passes: int


class PassEdge(BaseModel):
    from_player_id: int
    to_player_id: int
    count: int


class PassNetworkData(BaseModel):
    nodes: List[PassNode]
    edges: List[PassEdge]


class HeatmapCell(BaseModel):
    x: int
    y: int
    value: float


class HeatmapData(BaseModel):
    player_id: Optional[int] = None
    team: Optional[str] = None
    heatmap: List[HeatmapCell]
    grid_size: Tuple[int, int] = (10, 10)


class FormationData(BaseModel):
    team: str
    formation: str
    positions: Dict[int, Tuple[float, float]]
    period: Optional[str] = None


class TacticalAnalysis(BaseModel):
    match_id: int
    possession: PossessionData
    pass_network: Dict[str, PassNetworkData]
    heatmaps: List[HeatmapData]
    formations: List[FormationData]
    created_at: datetime
