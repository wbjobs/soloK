from typing import List, Any, Optional, Dict
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.match import Match
from app.models.tracking_data import TrackingData
from app.models.user import User
from app.schemas.tracking_data import TrackingData as TrackingDataSchema, FrameTrackingData, PlayerTracking

router = APIRouter(prefix="/matches/{match_id}/tracking", tags=["追踪数据"])


@router.get("", response_model=List[TrackingDataSchema])
def get_tracking_data(
    match_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    player_id: Optional[int] = None,
    team: Optional[str] = None,
    start_frame: Optional[int] = None,
    end_frame: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    query = db.query(TrackingData).filter(TrackingData.match_id == match_id)
    if player_id is not None:
        query = query.filter(TrackingData.player_id == player_id)
    if team:
        query = query.filter(TrackingData.team == team)
    if start_frame is not None:
        query = query.filter(TrackingData.frame_number >= start_frame)
    if end_frame is not None:
        query = query.filter(TrackingData.frame_number <= end_frame)

    tracking_data = query.order_by(TrackingData.frame_number, TrackingData.id).offset(skip).limit(limit).all()
    return tracking_data


@router.get("/frame", response_model=FrameTrackingData)
def get_frame_tracking(
    match_id: int,
    frame_number: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    frame_data = db.query(TrackingData).filter(
        TrackingData.match_id == match_id,
        TrackingData.frame_number == frame_number,
    ).all()

    if not frame_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frame data not found",
        )

    players = [
        PlayerTracking(
            player_id=td.player_id,
            x=td.x,
            y=td.y,
            team=td.team,
            camera_id=td.camera_id,
        )
        for td in frame_data
    ]

    return FrameTrackingData(
        match_id=match_id,
        frame_number=frame_number,
        timestamp=frame_data[0].timestamp,
        players=players,
    )


@router.get("/players/stats")
def get_player_stats(
    match_id: int,
    team: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    query = db.query(TrackingData).filter(TrackingData.match_id == match_id)
    if team:
        query = query.filter(TrackingData.team == team)

    all_tracking = query.all()

    player_positions: Dict[int, List[tuple]] = defaultdict(list)
    player_teams: Dict[int, str] = {}

    for td in all_tracking:
        if td.player_id is not None:
            player_positions[td.player_id].append((td.x, td.y, td.timestamp))
            player_teams[td.player_id] = td.team

    stats = []
    for player_id, positions in player_positions.items():
        total_distance = 0.0
        max_speed = 0.0
        prev_pos = None
        prev_time = None

        for x, y, timestamp in positions:
            if prev_pos is not None and prev_time is not None:
                dt = timestamp - prev_time
                if dt > 0:
                    dx = x - prev_pos[0]
                    dy = y - prev_pos[1]
                    distance = (dx**2 + dy**2) ** 0.5
                    total_distance += distance
                    speed = distance / dt
                    max_speed = max(max_speed, speed)
            prev_pos = (x, y)
            prev_time = timestamp

        avg_x = sum(p[0] for p in positions) / len(positions) if positions else 0
        avg_y = sum(p[1] for p in positions) / len(positions) if positions else 0

        stats.append({
            "player_id": player_id,
            "team": player_teams.get(player_id, ""),
            "total_distance": round(total_distance, 2),
            "max_speed": round(max_speed, 2),
            "avg_position": {"x": round(avg_x, 2), "y": round(avg_y, 2)},
            "frame_count": len(positions),
        })

    return {
        "match_id": match_id,
        "player_count": len(stats),
        "stats": stats,
    }
