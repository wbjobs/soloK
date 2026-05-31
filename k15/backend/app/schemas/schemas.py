from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class MissionBase(BaseModel):
    name: str
    description: Optional[str] = None


class MissionCreate(MissionBase):
    file_name: str
    file_format: str
    file_path: str


class MissionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class MissionResponse(MissionBase):
    id: int
    file_name: str
    file_format: str
    file_path: str
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DetectionBase(BaseModel):
    frame_index: int
    class_name: str
    confidence: float
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float


class DetectionCreate(DetectionBase):
    mission_id: int


class DetectionResponse(DetectionBase):
    id: int
    mission_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TrackBase(BaseModel):
    track_id: int
    class_name: str
    frame_start: int
    frame_end: int
    trajectory: dict


class TrackCreate(TrackBase):
    mission_id: int


class TrackResponse(TrackBase):
    id: int
    mission_id: int
    length_estimate: Optional[float] = None
    width_estimate: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MeasurementBase(BaseModel):
    detection_id: int
    track_id: Optional[int] = None
    actual_length: Optional[float] = None
    actual_width: Optional[float] = None
    depth: Optional[float] = None
    range_distance: Optional[float] = None


class MeasurementCreate(MeasurementBase):
    mission_id: int


class MeasurementResponse(MeasurementBase):
    id: int
    mission_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DetectRequest(BaseModel):
    mission_id: int
    frame_data: Optional[dict] = None


class DetectResponse(BaseModel):
    success: bool
    detections: List[dict]
    tracks: List[dict]
    message: Optional[str] = None


class BBoxItem(BaseModel):
    x: float
    y: float
    width: float
    height: float


class DetectionItem(BaseModel):
    class_name: str
    confidence: float
    bbox: BBoxItem


class FrameDetectionResult(BaseModel):
    frame_index: int
    detections: List[DetectionItem]


class TrackItem(BaseModel):
    track_id: int
    class_name: str
    frame_start: int
    frame_end: int
    trajectory: List[dict]
    length_estimate: Optional[float] = None
    width_estimate: Optional[float] = None
