from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

from app.models.match import MatchStatus


class CameraBase(BaseModel):
    camera_id: str
    video_path: str
    name: Optional[str] = None


class CameraCreate(CameraBase):
    pass


class Camera(CameraBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    match_id: int
    created_at: datetime


class MatchBase(BaseModel):
    title: str
    video_path: str
    home_team: str
    away_team: str
    match_date: Optional[datetime] = None


class MatchCreate(MatchBase):
    cameras: Optional[List[CameraCreate]] = None


class MatchUpdate(BaseModel):
    title: Optional[str] = None
    video_path: Optional[str] = None
    home_team: Optional[str] = None
    away_team: Optional[str] = None
    match_date: Optional[datetime] = None
    status: Optional[MatchStatus] = None


class Match(MatchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: MatchStatus
    owner_id: int
    created_at: datetime
    cameras: List[Camera] = []


class MatchWithDetails(Match):
    player_count: int
    tracking_data_count: int
    event_count: int
    analysis_result_count: int
