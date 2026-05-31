import os
import tempfile
from typing import Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.match import Match
from app.models.event import Event
from app.models.user import User
from app.services import ReportGenerator

router = APIRouter(prefix="/matches/{match_id}/export", tags=["导出"])


@router.get("/report")
def export_report(
    match_id: int,
    format: str = Query("pdf", pattern="^(pdf|html)$"),
    include_heatmaps: bool = True,
    include_pass_network: bool = True,
    include_events: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    report_generator = ReportGenerator(db, match_id)

    try:
        if format == "pdf":
            file_path = report_generator.generate_pdf_report(
                include_heatmaps=include_heatmaps,
                include_pass_network=include_pass_network,
                include_events=include_events,
            )
            media_type = "application/pdf"
            filename = f"match_{match_id}_report.pdf"
        else:
            file_path = report_generator.generate_html_report(
                include_heatmaps=include_heatmaps,
                include_pass_network=include_pass_network,
                include_events=include_events,
            )
            media_type = "text/html"
            filename = f"match_{match_id}_report.html"
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate report: {str(e)}",
        )

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Generated report file not found",
        )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
    )


@router.get("/tactical-animation")
def export_tactical_animation(
    match_id: int,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    format: str = Query("mp4", pattern="^(mp4|gif|webm)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    report_generator = ReportGenerator(db, match_id)

    try:
        file_path = report_generator.generate_tactical_animation(
            start_time=start_time,
            end_time=end_time,
            format=format,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate tactical animation: {str(e)}",
        )

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Generated animation file not found",
        )

    media_types = {
        "mp4": "video/mp4",
        "gif": "image/gif",
        "webm": "video/webm",
    }

    return FileResponse(
        path=file_path,
        media_type=media_types.get(format, "video/mp4"),
        filename=f"match_{match_id}_tactical_animation.{format}",
    )


@router.get("/event-clip/{event_id}")
def export_event_clip(
    match_id: int,
    event_id: int,
    pre_seconds: float = Query(5.0, ge=0, le=30),
    post_seconds: float = Query(5.0, ge=0, le=30),
    format: str = Query("mp4", pattern="^(mp4|webm)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    event = db.query(Event).filter(
        Event.id == event_id,
        Event.match_id == match_id,
    ).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    report_generator = ReportGenerator(db, match_id)

    try:
        file_path = report_generator.generate_event_clip(
            event=event,
            pre_seconds=pre_seconds,
            post_seconds=post_seconds,
            format=format,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate event clip: {str(e)}",
        )

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Generated clip file not found",
        )

    media_types = {
        "mp4": "video/mp4",
        "webm": "video/webm",
    }

    return FileResponse(
        path=file_path,
        media_type=media_types.get(format, "video/mp4"),
        filename=f"match_{match_id}_event_{event_id}_clip.{format}",
    )
