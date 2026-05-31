from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class EventBase(BaseModel):
    match_id: int
    event_type: str
    timestamp: float
    frame_number: int
    player_id: Optional[int] = None
    team: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    details: Optional[Dict[str, Any]] = None


class EventCreate(EventBase):
    pass


class Event(EventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class EventFilter(BaseModel):
    match_id: Optional[int] = None
    event_type: Optional[str] = None
    team: Optional[str] = None
    player_id: Optional[int] = None
    min_timestamp: Optional[float] = None
    max_timestamp: Optional[float] = None
    min_frame: Optional[int] = None
    max_frame: Optional[int] = None
