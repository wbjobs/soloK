from __future__ import annotations

import asyncio
import json
from typing import Dict, List

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from .signal_processing import (
    ExperimentConfig,
    config_to_dict,
    dict_to_config,
    standard_1020_layout,
)
from .stream_manager import StreamManager
from . import storage


router = APIRouter()
manager = StreamManager()


@router.websocket("/ws/{session_id}")
async def ws_stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    if session_id not in manager.sessions:
        cfg = ExperimentConfig(name="default", srate=1000, channels=standard_1020_layout(32))
        manager.start(session_id, cfg)
    # default subscription (default display_srate=200
    sub = manager.subscribe(session_id, websocket, display_srate=200)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except Exception:
                continue
            action = msg.get("action")
            sess = manager.sessions.get(session_id)
            if sess:
                if action == "event":
                    sess.add_event(msg.get("event", {}))
                    await websocket.send_json({"type": "event_ack", "event": msg.get("event")})
                elif action == "analysis":
                    band = msg.get("band", "Alpha")
                    result = manager.analysis(session_id, band=band)
                    await websocket.send_json(result)
                elif action == "snapshot":
                    snap = manager.snapshot(session_id, seconds=msg.get("seconds", 10.0))
                    if snap:
                        await websocket.send_json(snap)
                elif action == "configure_stream":
                    sub.display_srate = int(msg.get("display_srate", 200))
                    sub.send_interval = float(msg.get("send_interval", 0.05))
                    await websocket.send_json({
                        "type": "stream_configured",
                        "display_srate": sub.display_srate,
                        "send_interval": sub.send_interval,
                    })
                elif action == "stop":
                    manager.stop(session_id)
                    break
    except WebSocketDisconnect:
        pass
    finally:
        manager.unsubscribe(websocket)


@router.get("/sessions")
def list_sessions(subject: str | None = None) -> List[Dict]:
    return storage.list_sessions(subject)


@router.post("/sessions")
def create_session(req: Dict) -> Dict:
    subject = req.get("subject", "anonymous")
    config_name = req.get("config", "default")
    cfg_dict = storage.load_config(config_name)
    cfg = dict_to_config(cfg_dict) if cfg_dict else ExperimentConfig(
        name=config_name, srate=500, channels=standard_1020_layout(32)
    )
    session = storage.create_session(subject, config_name)
    manager.start(session["id"], cfg)
    return session


@router.post("/sessions/{session_id}/events")
def add_event(session_id: str, event: Dict) -> Dict:
    s = storage.add_event(session_id, event)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")
    # also push to live session if active
    live = manager.sessions.get(session_id)
    if live:
        live.add_event(event)
    return {"ok": True, "events": s["events"]}


@router.get("/sessions/{session_id}/erp")
def get_erp(session_id: str) -> Dict:
    s = storage.get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")
    return {"id": session_id, "erp_avg": s.get("erp_avg", {}), "events": s.get("events", [])}


@router.get("/sessions/{session_id}/compare")
def compare_sessions(session_id: str, other: str) -> Dict:
    a = storage.get_session(session_id)
    b = storage.get_session(other)
    if not a or not b:
        raise HTTPException(status_code=404, detail="session not found")
    return {
        "a": a.get("erp_avg", {}),
        "b": b.get("erp_avg", {}),
        "subject_a": a.get("subject"),
        "subject_b": b.get("subject"),
    }


@router.get("/configs")
def list_configs() -> List[str]:
    return storage.list_configs()


@router.get("/configs/{name}")
def get_config(name: str) -> Dict:
    d = storage.load_config(name)
    if not d:
        raise HTTPException(status_code=404, detail="config not found")
    return d


@router.post("/configs")
def save_config(req: Dict) -> Dict:
    name = req.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    storage.save_config(name, req)
    return {"ok": True, "name": name}


@router.get("/layouts/standard1020")
def standard_layout(n: int = 32) -> Dict:
    cfg = ExperimentConfig(name="standard-1020", srate=500, channels=standard_1020_layout(n))
    return config_to_dict(cfg)


@router.post("/export/erp")
def export_erp(req: Dict) -> Dict:
    sid = req.get("session_id")
    s = storage.get_session(sid)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")
    return {
        "session_id": sid,
        "subject": s.get("subject"),
        "config": s.get("config"),
        "events": s.get("events", []),
        "erp_avg": s.get("erp_avg", {}),
    }
