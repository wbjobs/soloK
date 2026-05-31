import os
import uuid
from typing import List, Any, Dict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.match import Match, Camera, MatchStatus
from app.models.user import User
from app.schemas.match import MatchCreate, Match as MatchSchema, MatchWithDetails, CameraCreate
from app.services import AnalysisOrchestrator

router = APIRouter(prefix="/matches", tags=["比赛管理"])

analysis_tasks: Dict[int, AnalysisOrchestrator] = {}
active_websockets: Dict[int, List[WebSocket]] = {}


@router.get("", response_model=List[MatchSchema])
def get_matches(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    status: MatchStatus = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    query = db.query(Match).filter(Match.owner_id == current_user.id)
    if status:
        query = query.filter(Match.status == status)
    matches = query.order_by(Match.created_at.desc()).offset(skip).limit(limit).all()
    return matches


@router.get("/{match_id}", response_model=MatchWithDetails)
def get_match(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )
    return MatchWithDetails(
        **{c.name: getattr(match, c.name) for c in match.__table__.columns},
        player_count=len(match.players),
        tracking_data_count=len(match.tracking_data),
        event_count=len(match.events),
        analysis_result_count=len(match.analysis_results),
        cameras=match.cameras,
    )


@router.post("/upload", response_model=MatchSchema, status_code=status.HTTP_201_CREATED)
async def upload_match(
    title: str = Form(...),
    home_team: str = Form(...),
    away_team: str = Form(...),
    match_date: datetime = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files uploaded",
        )

    upload_dir = os.path.join(settings.VIDEO_UPLOAD_DIR, str(current_user.id))
    os.makedirs(upload_dir, exist_ok=True)

    cameras = []
    primary_video_path = None

    for idx, file in enumerate(files):
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)

        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        if idx == 0:
            primary_video_path = file_path

        cameras.append(CameraCreate(
            camera_id=f"cam_{idx}",
            video_path=file_path,
            name=file.filename,
        ))

    match = Match(
        title=title,
        video_path=primary_video_path,
        home_team=home_team,
        away_team=away_team,
        match_date=match_date,
        status=MatchStatus.PENDING,
        owner_id=current_user.id,
    )
    db.add(match)
    db.flush()

    for cam in cameras:
        camera = Camera(
            match_id=match.id,
            camera_id=cam.camera_id,
            video_path=cam.video_path,
            name=cam.name,
        )
        db.add(camera)

    db.commit()
    db.refresh(match)
    return match


@router.post("/{match_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
def start_analysis(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )
    if match.status == MatchStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analysis already in progress",
        )

    match.status = MatchStatus.PROCESSING
    db.commit()

    orchestrator = AnalysisOrchestrator(db, match_id)
    analysis_tasks[match_id] = orchestrator

    async def progress_callback(progress: float, message: str):
        if match_id in active_websockets:
            for ws in active_websockets[match_id]:
                await ws.send_json({
                    "progress": progress,
                    "message": message,
                    "status": MatchStatus.PROCESSING.value,
                })

    import asyncio
    loop = asyncio.get_event_loop()
    loop.create_task(orchestrator.run_analysis(progress_callback))

    return {"message": "Analysis started", "match_id": match_id}


@router.get("/{match_id}/status")
def get_analysis_status(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )
    return {
        "match_id": match_id,
        "status": match.status.value,
    }


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_match(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    for camera in match.cameras:
        if os.path.exists(camera.video_path):
            os.remove(camera.video_path)

    if match_id in analysis_tasks:
        del analysis_tasks[match_id]
    if match_id in active_websockets:
        del active_websockets[match_id]

    db.delete(match)
    db.commit()


@router.websocket("/{match_id}/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    match_id: int,
    db: Session = Depends(get_db),
) -> None:
    await websocket.accept()

    try:
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        from app.core.deps import oauth2_scheme
        from jose import JWTError, jwt
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = payload.get("sub")
            if user_id is None:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        except JWTError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        user = db.query(User).filter(User.id == int(user_id)).first()
        match = db.query(Match).filter(Match.id == match_id, Match.owner_id == user.id).first()
        if not match:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        if match_id not in active_websockets:
            active_websockets[match_id] = []
        active_websockets[match_id].append(websocket)

        while True:
            data = await websocket.receive_text()
            await websocket.send_json({
                "type": "pong",
                "timestamp": datetime.utcnow().isoformat(),
            })

    except WebSocketDisconnect:
        if match_id in active_websockets and websocket in active_websockets[match_id]:
            active_websockets[match_id].remove(websocket)
            if not active_websockets[match_id]:
                del active_websockets[match_id]
    except Exception:
        if match_id in active_websockets and websocket in active_websockets[match_id]:
            active_websockets[match_id].remove(websocket)
            if not active_websockets[match_id]:
                del active_websockets[match_id]
