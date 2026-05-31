import uuid
from typing import Any, Dict, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.services import LiveStreamProcessor

router = APIRouter(prefix="/live", tags=["直播流"])


class StreamConnectRequest(BaseModel):
    url: str
    stream_type: str = Query("rtsp", pattern="^(rtsp|rtmp|http)$")
    match_id: int = None


class StreamStatus(BaseModel):
    stream_id: str
    url: str
    status: str
    connected_at: datetime
    frames_processed: int
    events_detected: int


live_streams: Dict[str, LiveStreamProcessor] = {}
live_websockets: Dict[str, List[WebSocket]] = {}


@router.post("/connect")
def connect_live_stream(
    request: StreamConnectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    stream_id = str(uuid.uuid4())

    try:
        processor = LiveStreamProcessor(
            stream_url=request.url,
            stream_type=request.stream_type,
            match_id=request.match_id,
            user_id=current_user.id,
            db=db,
        )

        async def data_callback(data: dict):
            if stream_id in live_websockets:
                for ws in live_websockets[stream_id]:
                    await ws.send_json(data)

        processor.set_data_callback(data_callback)
        processor.start()

        live_streams[stream_id] = processor

        return {
            "stream_id": stream_id,
            "url": request.url,
            "status": "connecting",
            "connected_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect to stream: {str(e)}",
        )


@router.post("/{stream_id}/disconnect", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_live_stream(
    stream_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    if stream_id not in live_streams:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stream not found",
        )

    processor = live_streams[stream_id]
    if processor.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to disconnect this stream",
        )

    try:
        processor.stop()
    finally:
        del live_streams[stream_id]
        if stream_id in live_websockets:
            for ws in live_websockets[stream_id]:
                await ws.close()
            del live_websockets[stream_id]


@router.get("/{stream_id}/status", response_model=StreamStatus)
def get_live_stream_status(
    stream_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    if stream_id not in live_streams:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stream not found",
        )

    processor = live_streams[stream_id]
    if processor.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this stream",
        )

    return StreamStatus(
        stream_id=stream_id,
        url=processor.stream_url,
        status=processor.get_status(),
        connected_at=processor.connected_at,
        frames_processed=processor.frames_processed,
        events_detected=processor.events_detected,
    )


@router.websocket("/{stream_id}/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    stream_id: str,
    db: Session = Depends(get_db),
) -> None:
    await websocket.accept()

    try:
        from app.core.config import settings
        from jose import JWTError, jwt

        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = payload.get("sub")
            if user_id is None:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        except JWTError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        if stream_id not in live_streams:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        processor = live_streams[stream_id]
        if processor.user_id != int(user_id):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        if stream_id not in live_websockets:
            live_websockets[stream_id] = []
        live_websockets[stream_id].append(websocket)

        await websocket.send_json({
            "type": "connected",
            "stream_id": stream_id,
            "status": processor.get_status(),
        })

        while True:
            data = await websocket.receive_text()
            await websocket.send_json({
                "type": "pong",
                "timestamp": datetime.utcnow().isoformat(),
            })

    except WebSocketDisconnect:
        if stream_id in live_websockets and websocket in live_websockets[stream_id]:
            live_websockets[stream_id].remove(websocket)
            if not live_websockets[stream_id]:
                del live_websockets[stream_id]
    except Exception:
        if stream_id in live_websockets and websocket in live_websockets[stream_id]:
            live_websockets[stream_id].remove(websocket)
            if not live_websockets[stream_id]:
                del live_websockets[stream_id]
