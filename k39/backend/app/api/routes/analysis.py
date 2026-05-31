from typing import Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.match import Match
from app.models.analysis_result import AnalysisResult
from app.models.tracking_data import TrackingData
from app.models.user import User
from app.schemas.analysis_result import HeatmapData, HeatmapCell, PassNetworkData, PassNode, PassEdge, FormationData, PossessionData
from app.services import TacticalAnalyzer

router = APIRouter(prefix="/matches/{match_id}/analysis", tags=["分析结果"])


@router.get("/heatmap", response_model=List[HeatmapData])
def get_heatmap(
    match_id: int,
    player_id: Optional[int] = None,
    team: Optional[str] = None,
    grid_size: int = Query(10, ge=5, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    analyzer = TacticalAnalyzer(db, match_id)
    try:
        heatmaps = analyzer.generate_heatmaps(
            player_id=player_id,
            team=team,
            grid_size=(grid_size, grid_size),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate heatmap: {str(e)}",
        )

    return heatmaps


@router.get("/pass-network", response_model=dict)
def get_pass_network(
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

    analyzer = TacticalAnalyzer(db, match_id)
    try:
        pass_network = analyzer.generate_pass_network(team=team)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate pass network: {str(e)}",
        )

    return pass_network


@router.get("/formation", response_model=List[FormationData])
def get_formation(
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

    analyzer = TacticalAnalyzer(db, match_id)
    try:
        formations = analyzer.detect_formations(team=team)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to detect formation: {str(e)}",
        )

    return formations


@router.get("/possession", response_model=PossessionData)
def get_possession(
    match_id: int,
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    analyzer = TacticalAnalyzer(db, match_id)
    try:
        possession = analyzer.calculate_possession()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate possession: {str(e)}",
        )

    return possession


@router.get("/players/{player_id}/runs")
def get_player_runs(
    match_id: int,
    player_id: int,
    min_distance: float = Query(5.0, ge=0),
    min_speed: float = Query(2.0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    tracking_data = db.query(TrackingData).filter(
        TrackingData.match_id == match_id,
        TrackingData.player_id == player_id,
    ).order_by(TrackingData.frame_number).all()

    if not tracking_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tracking data found for this player",
        )

    runs = []
    current_run = None
    prev_pos = None
    prev_time = None

    for td in tracking_data:
        if prev_pos is not None and prev_time is not None:
            dt = td.timestamp - prev_time
            if dt > 0:
                dx = td.x - prev_pos[0]
                dy = td.y - prev_pos[1]
                distance = (dx**2 + dy**2) ** 0.5
                speed = distance / dt if dt > 0 else 0

                if speed >= min_speed:
                    if current_run is None:
                        current_run = {
                            "start_frame": td.frame_number,
                            "start_time": td.timestamp,
                            "start_pos": {"x": prev_pos[0], "y": prev_pos[1]},
                            "distance": 0.0,
                            "max_speed": speed,
                            "positions": [{"x": prev_pos[0], "y": prev_pos[1]}],
                        }
                    current_run["distance"] += distance
                    current_run["max_speed"] = max(current_run["max_speed"], speed)
                    current_run["end_frame"] = td.frame_number
                    current_run["end_time"] = td.timestamp
                    current_run["end_pos"] = {"x": td.x, "y": td.y}
                    current_run["positions"].append({"x": td.x, "y": td.y})
                    current_run["avg_speed"] = current_run["distance"] / (current_run["end_time"] - current_run["start_time"]) if (current_run["end_time"] - current_run["start_time"]) > 0 else 0
                else:
                    if current_run is not None and current_run["distance"] >= min_distance:
                        runs.append(current_run)
                    current_run = None

        prev_pos = (td.x, td.y)
        prev_time = td.timestamp

    if current_run is not None and current_run["distance"] >= min_distance:
        runs.append(current_run)

    return {
        "match_id": match_id,
        "player_id": player_id,
        "run_count": len(runs),
        "total_distance": sum(r["distance"] for r in runs),
        "runs": runs,
    }
