from typing import Optional, List, Dict
from pydantic import BaseModel, ConfigDict


class TrackingDataBase(BaseModel):
    match_id: int
    frame_number: int
    timestamp: float
    player_id: Optional[int] = None
    x: float
    y: float
    team: str
    camera_id: str


class TrackingDataCreate(TrackingDataBase):
    pass


class TrackingData(TrackingDataBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class PlayerTracking(BaseModel):
    player_id: Optional[int]
    x: float
    y: float
    team: str
    camera_id: str


class FrameTrackingData(BaseModel):
    match_id: int
    frame_number: int
    timestamp: float
    players: List[PlayerTracking]
