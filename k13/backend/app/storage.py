from __future__ import annotations

import json
import time
from typing import Dict, List, Optional

import numpy as np


STORE: Dict[str, Dict] = {}


def save_config(name: str, cfg_dict: Dict) -> None:
    STORE[f"config:{name}"] = cfg_dict


def load_config(name: str) -> Optional[Dict]:
    return STORE.get(f"config:{name}")


def list_configs() -> List[str]:
    return [k.split(":", 1)[1] for k in STORE if k.startswith("config:")]


# --- sessions ---
SESSIONS: Dict[str, Dict] = {}


def create_session(subject: str, config_name: str) -> Dict:
    sid = f"sess-{int(time.time()*1000)}"
    s = {
        "id": sid,
        "subject": subject,
        "config": config_name,
        "created": time.time(),
        "events": [],
        "erp_avg": {},
        "status": "running",
    }
    SESSIONS[sid] = s
    return s


def list_sessions(subject: Optional[str] = None) -> List[Dict]:
    out = list(SESSIONS.values())
    if subject:
        out = [s for s in out if s["subject"] == subject]
    return sorted(out, key=lambda s: s["created"], reverse=True)


def get_session(sid: str) -> Optional[Dict]:
    return SESSIONS.get(sid)


def add_event(sid: str, event: Dict) -> Optional[Dict]:
    s = SESSIONS.get(sid)
    if not s:
        return None
    s["events"].append(event)
    return s


def store_erp_avg(sid: str, erp_dict: Dict) -> None:
    s = SESSIONS.get(sid)
    if s:
        s["erp_avg"] = {k: v.tolist() for k, v in erp_dict.items()}
