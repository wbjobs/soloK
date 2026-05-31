from __future__ import annotations

import asyncio
import base64
import io
import json
import struct
import time
from collections import deque
from typing import Dict, List, Optional

import numpy as np
from fastapi import WebSocket

from .signal_processing import (
    BANDS,
    ExperimentConfig,
    OnlineFilter,
    band_power,
    detect_artifacts,
    erp_segments,
    scalp_topography,
    standard_1020_layout,
    time_locked_average,
    welch_psd,
)
from .simulator import SimulatedEEGSource, simulated_stream
from .source_localization import SourceModel, build_source_model, band_limited_current_density
from .connectivity import plv_matrix, top_edges, force_directed_layout


DEFAULT_DISPLAY_SRATE = 200  # target display rate (Hz) for the waterfall
DEFAULT_SEND_INTERVAL = 0.05  # 50ms between WS frames = 20 FPS


class Session:
    """An active streaming session: holds ringbuffer, filter, analysis state."""

    def __init__(
        self,
        config: ExperimentConfig,
        waterfall_sec: float = 10.0,
        psd_win: float = 2.0,
        display_srate: int = DEFAULT_DISPLAY_SRATE,
    ):
        self.config = config
        self.srate = config.srate
        self.n_chan = len(config.channels)
        self.waterfall_sec = waterfall_sec
        self.psd_win = psd_win
        self.display_srate = min(display_srate, self.srate)
        # Full-rate ring buffer (for analysis)
        self._ring: deque = deque(maxlen=int(waterfall_sec * self.srate))
        # Display-rate ring buffer (downsampled)
        self._display_ring: deque = deque(maxlen=int(waterfall_sec * self.display_srate))
        self._events: List[Dict] = []
        self._filt = OnlineFilter(self.srate, config.filter_params)
        self._t0 = time.time()
        # Downsample accumulator
        self._ds_accum: List[np.ndarray] = []
        self._ds_samples = 0
        self._ds_ratio = max(1, self.srate // self.display_srate)
        # Electrode positions (3D) for source localization
        self._elec_pos: Optional[np.ndarray] = None
        # Lazily built source model
        self._source_model: Optional[SourceModel] = None
        # Cached connectivity layout positions (stable across frames)
        self._conn_layout: Optional[np.ndarray] = None

    def _ensure_geometry(self) -> None:
        """Compute electrode positions and build source model on first call."""
        if self._elec_pos is None:
            # Convert spherical (theta=azimuth, phi=elevation from equator) to 3D cartesian
            thetas = np.array([c.x for c in self.config.channels], dtype=float)
            phis = np.array([c.y for c in self.config.channels], dtype=float)
            # phi is elevation from equator; polar angle from +z is pi/2 - phi
            polar = np.pi / 2.0 - phis
            r = 1.0
            x = r * np.sin(polar) * np.cos(thetas)
            y = r * np.sin(polar) * np.sin(thetas)
            z = r * np.cos(polar)
            self._elec_pos = np.stack([x, y, z], axis=-1)  # (n_chan, 3)
        if self._source_model is None:
            self._source_model = build_source_model(self._elec_pos, n_sources=162)

    @property
    def elec_pos(self) -> np.ndarray:
        self._ensure_geometry()
        return self._elec_pos  # type: ignore[return-value]

    @property
    def source_model(self) -> SourceModel:
        self._ensure_geometry()
        return self._source_model  # type: ignore[return-value]

    def push(self, chunk: np.ndarray) -> None:
        """chunk shape: (n_chan, n_samples) at full srate."""
        filtered = self._filt.apply(chunk)
        # Push to full-rate ring (sample by sample)
        for i in range(filtered.shape[1]):
            self._ring.append(filtered[:, i].astype(np.float32))
        # Downsample to display rate using simple decimation (after anti-aliasing handled by bandpass)
        self._ds_accum.append(filtered)
        self._ds_samples += filtered.shape[1]
        # Only process when we have enough samples for at least one display point
        while self._ds_samples >= self._ds_ratio:
            # Take the first _ds_ratio samples across all accumulated chunks
            needed = self._ds_ratio
            collected = np.zeros((self.n_chan, needed), dtype=np.float32)
            written = 0
            remaining = needed
            while remaining > 0 and self._ds_accum:
                blk = self._ds_accum[0]
                take = min(blk.shape[1], remaining)
                collected[:, written:written + take] = blk[:, :take]
                written += take
                remaining -= take
                if take == blk.shape[1]:
                    self._ds_accum.pop(0)
                else:
                    self._ds_accum[0] = blk[:, take:]
            self._ds_samples -= needed
            # Simple boxcar downsampling (mean)
            ds_point = np.mean(collected, axis=1, dtype=np.float32)
            self._display_ring.append(ds_point)

    def recent_window(self, seconds: Optional[float] = None) -> np.ndarray:
        if seconds is None:
            seconds = self.waterfall_sec
        n = min(len(self._ring), int(seconds * self.srate))
        if n == 0:
            return np.zeros((self.n_chan, 0), dtype=np.float32)
        return np.array(list(self._ring)[-n:], dtype=np.float32).T  # (n_chan, n)

    def display_window(self, seconds: Optional[float] = None) -> np.ndarray:
        """Return downsampled display window: (n_chan, m) where m ~= seconds * display_srate."""
        if seconds is None:
            seconds = self.waterfall_sec
        m = min(len(self._display_ring), int(seconds * self.display_srate))
        if m == 0:
            return np.zeros((self.n_chan, 0), dtype=np.float32)
        return np.array(list(self._display_ring)[-m:], dtype=np.float32).T  # (n_chan, m)

    def add_event(self, event: Dict) -> None:
        event.setdefault("sample", len(self._ring))
        event.setdefault("t", event["sample"] / self.srate)
        self._events.append(event)

    @property
    def events(self) -> List[Dict]:
        return list(self._events)


class SubscriberState:
    """Per-subscriber streaming settings and pending frame buffer."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.display_srate: int = DEFAULT_DISPLAY_SRATE
        self.send_interval: float = DEFAULT_SEND_INTERVAL
        self._pending: Optional[np.ndarray] = None  # (n_chan, k) display-rate samples to send
        self._last_send: float = 0.0

    def append(self, chunk: np.ndarray) -> None:
        """chunk shape: (n_chan, k) display-rate."""
        if self._pending is None:
            self._pending = chunk.copy()
        else:
            self._pending = np.concatenate([self._pending, chunk], axis=1)

    def should_send(self, now: float) -> bool:
        return (now - self._last_send) >= self.send_interval and (self._pending is not None and self._pending.shape[1] > 0)

    def take_payload(self, now: float) -> Optional[Dict]:
        if self._pending is None or self._pending.shape[1] == 0:
            return None
        payload = {
            "type": "eeg_delta",
            "n_chan": int(self._pending.shape[0]),
            "display_srate": self.display_srate,
            "n_samples": int(self._pending.shape[1]),
            "samples_b64": _encode_float32_b64(self._pending),
        }
        self._pending = None
        self._last_send = now
        return payload


class StreamManager:
    """Manages active sessions for all connected clients with efficient delta streaming."""

    def __init__(self):
        self.sessions: Dict[str, Session] = {}
        self.subscribers: Dict[str, List[SubscriberState]] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._sender_tasks: Dict[str, asyncio.Task] = {}

    def start(self, session_id: str, config: Optional[ExperimentConfig] = None) -> Session:
        if session_id in self.sessions:
            return self.sessions[session_id]
        if config is None:
            config = ExperimentConfig(name="default", srate=500, channels=standard_1020_layout(32))
        sess = Session(config)
        self.sessions[session_id] = sess
        self.subscribers[session_id] = []
        # start simulated stream task
        src = SimulatedEEGSource(n_chan=len(config.channels), srate=config.srate)
        task = asyncio.create_task(self._run_sim(session_id, src))
        self._tasks[session_id] = task
        # start sender task that flushes subscriber buffers at fixed interval
        sender = asyncio.create_task(self._run_sender(session_id))
        self._sender_tasks[session_id] = sender
        return sess

    def stop(self, session_id: str) -> None:
        for t in (self._tasks, self._sender_tasks):
            task = t.pop(session_id, None)
            if task:
                task.cancel()
        self.sessions.pop(session_id, None)
        self.subscribers.pop(session_id, None)

    async def _run_sim(self, session_id: str, src: SimulatedEEGSource) -> None:
        sess = self.sessions[session_id]
        try:
            async for msg in simulated_stream(src, chunk_sec=0.02):  # 20ms chunks = 50 Hz incoming
                samples = np.array(msg["samples"], dtype=np.float32)
                sess.push(samples)
                # Distribute display-rate samples to all subscribers
                n_ds = int(0.02 * sess.display_srate)
                if n_ds > 0 and len(sess._display_ring) >= n_ds:
                    latest = np.array(list(sess._display_ring)[-n_ds:], dtype=np.float32).T  # (n_chan, n_ds)
                    for sub in self.subscribers.get(session_id, []):
                        sub.append(latest)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            await self._broadcast_control(session_id, {"type": "error", "message": str(exc)})

    async def _run_sender(self, session_id: str) -> None:
        """Flush subscriber pending buffers at controlled interval."""
        try:
            while True:
                await asyncio.sleep(0.01)  # 10ms tick
                now = time.time()
                for sub in self.subscribers.get(session_id, []):
                    if sub.should_send(now):
                        payload = sub.take_payload(now)
                        if payload:
                            try:
                                await sub.ws.send_json(payload)
                            except Exception:
                                pass
        except asyncio.CancelledError:
            pass

    async def _broadcast_control(self, session_id: str, msg: Dict) -> None:
        for sub in self.subscribers.get(session_id, []):
            try:
                await sub.ws.send_json(msg)
            except Exception:
                pass

    def subscribe(self, session_id: str, ws: WebSocket, display_srate: int = DEFAULT_DISPLAY_SRATE) -> SubscriberState:
        state = SubscriberState(ws)
        state.display_srate = min(display_srate, DEFAULT_DISPLAY_SRATE * 2)
        self.subscribers.setdefault(session_id, []).append(state)
        return state

    def unsubscribe(self, ws: WebSocket) -> None:
        for sid, subs in self.subscribers.items():
            self.subscribers[sid] = [s for s in subs if s.ws != ws]

    def analysis(self, session_id: str, band: str = "Alpha") -> Dict:
        sess = self.sessions.get(session_id)
        if not sess:
            return {}
        win = sess.recent_window()
        if win.shape[1] < int(0.5 * sess.srate):
            return {}
        # PSD
        freqs, psd = welch_psd(win, sess.srate)
        band_range = BANDS.get(band, BANDS["Alpha"])
        power = band_power(psd, freqs, band_range)
        # Artifacts on the most recent 2s
        recent2 = sess.recent_window(2.0)
        eog_mask = sess.config.kind_mask("EOG")
        emg_mask = sess.config.kind_mask("EMG")
        artifacts = detect_artifacts(recent2, sess.srate, eog_mask, emg_mask)
        # Topography using EEG channels
        eeg_chans = [c for c in sess.config.channels if c.kind == "EEG"]
        idx = [i for i, c in enumerate(sess.config.channels) if c.kind == "EEG"]
        xs, ys, z, verts, v3d = None, None, None, None, None
        if eeg_chans and len(idx) == len(power[idx]):
            xs, ys, z, verts, v3d = scalp_topography(power[idx], eeg_chans)
        # ERP average if events exist
        erp_avg = {}
        if sess.events:
            epochs = erp_segments(win, sess.srate, sess.events, tmin=-0.2, tmax=0.8)
            if epochs:
                avg = time_locked_average(epochs)
                erp_avg = {k: v.tolist() for k, v in avg.items()}

        # --- Source localization (sLORETA) ---
        src = sess.source_model
        eeg_idx = [i for i, c in enumerate(sess.config.channels) if c.kind == "EEG"]
        eeg_data = win[eeg_idx, :] if eeg_idx else win
        source_density = band_limited_current_density(
            src, eeg_data, sess.srate, band=band_range
        )
        # Normalise to 0-1 for display
        src_min, src_max = float(source_density.min()), float(source_density.max())
        src_range = src_max - src_min
        if src_range > 1e-10:
            source_norm = (source_density - src_min) / src_range
        else:
            source_norm = np.zeros_like(source_density)

        # --- Connectivity (PLV) ---
        plv = plv_matrix(eeg_data, sess.srate, band=band_range)
        edges = top_edges(plv, k=10)
        # Recompute layout positions if needed (or when edge set changes significantly)
        if sess._conn_layout is None or sess._conn_layout.shape[0] != len(eeg_idx):
            sess._conn_layout = force_directed_layout(edges, len(eeg_idx))
        pos = sess._conn_layout

        return {
            "type": "analysis",
            "band": band,
            "freqs": freqs.tolist(),
            "psd": psd.tolist(),
            "band_power": power.tolist(),
            "artifacts": artifacts,
            "topo": {
                "xs": xs.tolist() if xs is not None else None,
                "ys": ys.tolist() if ys is not None else None,
                "z": z.tolist() if z is not None else None,
                "verts": verts.tolist() if verts is not None else None,
                "v3d": v3d.tolist() if v3d is not None else None,
            },
            "erp_avg": erp_avg,
            "events": sess.events,
            "source": {
                "positions": src.source_pos.tolist(),
                "faces": src.faces.tolist(),
                "density": source_norm.tolist(),
                "density_raw": source_density.tolist(),
                "n_sources": src.n_sources,
            },
            "connectivity": {
                "plv": plv.tolist(),
                "edges": [{"i": e[0], "j": e[1], "weight": e[2]} for e in edges],
                "node_positions": pos.tolist(),
                "node_labels": [sess.config.channels[i].label for i in eeg_idx],
            },
        }

    def snapshot(self, session_id: str, seconds: float = 10.0) -> Optional[Dict]:
        """Return a full display snapshot for initial client sync."""
        sess = self.sessions.get(session_id)
        if not sess:
            return None
        win = sess.display_window(seconds)
        return {
            "type": "eeg_snapshot",
            "n_chan": int(win.shape[0]),
            "display_srate": sess.display_srate,
            "n_samples": int(win.shape[1]),
            "samples_b64": _encode_float32_b64(win),
            "full_srate": sess.srate,
            "chan_labels": sess.config.chan_labels(),
        }


def _encode_float32_b64(arr: np.ndarray) -> str:
    """Encode a float32 numpy array to base64 string (compact binary)."""
    buf = io.BytesIO()
    np.save(buf, arr.astype(np.float32), allow_pickle=False)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _decode_float32_b64(s: str) -> np.ndarray:
    buf = io.BytesIO(base64.b64decode(s))
    return np.load(buf)
