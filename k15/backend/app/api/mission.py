from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.models import Mission, Detection, Track, Measurement
from app.schemas.schemas import (
    MissionCreate,
    MissionUpdate,
    MissionResponse,
    DetectionResponse,
    TrackResponse,
    MeasurementResponse,
)
from app.core.logging import logger

router = APIRouter(prefix="/api/missions", tags=["Missions"])


@router.get("", response_model=List[MissionResponse])
async def list_missions(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Mission)
    if status:
        query = query.filter(Mission.status == status)

    missions = query.order_by(Mission.created_at.desc()).offset(skip).limit(limit).all()
    return missions


@router.post("", response_model=MissionResponse)
async def create_mission(
    mission: MissionCreate,
    db: Session = Depends(get_db),
):
    db_mission = Mission(**mission.dict())
    db.add(db_mission)
    db.commit()
    db.refresh(db_mission)
    return db_mission


@router.get("/{mission_id}", response_model=MissionResponse)
async def get_mission(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return mission


@router.put("/{mission_id}", response_model=MissionResponse)
async def update_mission(
    mission_id: int,
    mission_update: MissionUpdate,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    update_data = mission_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(mission, key, value)

    db.commit()
    db.refresh(mission)
    return mission


@router.delete("/{mission_id}")
async def delete_mission(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    db.query(Detection).filter(Detection.mission_id == mission_id).delete()
    db.query(Track).filter(Track.mission_id == mission_id).delete()
    db.query(Measurement).filter(Measurement.mission_id == mission_id).delete()

    db.delete(mission)
    db.commit()

    return {"success": True, "message": "Mission deleted"}


@router.get("/{mission_id}/detections", response_model=List[DetectionResponse])
async def get_mission_detections(
    mission_id: int,
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    detections = (
        db.query(Detection)
        .filter(Detection.mission_id == mission_id)
        .order_by(Detection.frame_index, Detection.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return detections


@router.get("/{mission_id}/tracks", response_model=List[TrackResponse])
async def get_mission_tracks(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    tracks = (
        db.query(Track)
        .filter(Track.mission_id == mission_id)
        .order_by(Track.track_id)
        .all()
    )
    return tracks


@router.get("/{mission_id}/measurements", response_model=List[MeasurementResponse])
async def get_mission_measurements(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    measurements = (
        db.query(Measurement)
        .filter(Measurement.mission_id == mission_id)
        .all()
    )
    return measurements


@router.get("/{mission_id}/statistics")
async def get_mission_statistics(
    mission_id: int,
    db: Session = Depends(get_db),
):
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    detections = db.query(Detection).filter(Detection.mission_id == mission_id).all()
    tracks = db.query(Track).filter(Track.mission_id == mission_id).all()
    measurements = db.query(Measurement).filter(Measurement.mission_id == mission_id).all()

    class_counts = {}
    for det in detections:
        cls = det.class_name
        class_counts[cls] = class_counts.get(cls, 0) + 1

    avg_confidence = (
        sum(det.confidence for det in detections) / len(detections)
        if detections
        else 0
    )

    return {
        "mission_id": mission_id,
        "mission_name": mission.name,
        "total_detections": len(detections),
        "total_tracks": len(tracks),
        "total_measurements": len(measurements),
        "class_counts": class_counts,
        "average_confidence": round(avg_confidence, 4),
        "status": mission.status,
    }
