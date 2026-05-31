import asyncio
import json
import logging
import threading
import struct
import base64
from pathlib import Path
from typing import Set, Optional
from dataclasses import dataclass, field
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from simulation.lj_simulator import LJSimulator
from simulation.hdf5_writer import SimulationParams

logger = logging.getLogger(__name__)

app = FastAPI(title="Lennard-Jones Particle Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"


class ElectricFieldInput(BaseModel):
    E_x: float = 0.0
    E_y: float = 0.0
    E_z: float = 0.0


@dataclass
class TrajectoryFrame:
    step: int
    time: float
    positions: list[float]
    speeds: list[float]


@dataclass
class RecordingState:
    is_recording: bool = False
    start_step: Optional[int] = None
    frames: list[TrajectoryFrame] = field(default_factory=list)
    record_every: int = 10
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def add_frame(self, step: int, time: float, positions: list, speeds: list) -> bool:
        with self._lock:
            if not self.is_recording:
                return False
            if self.start_step is None:
                self.start_step = step
            rel_step = step - self.start_step
            if rel_step % self.record_every == 0:
                self.frames.append(TrajectoryFrame(
                    step=step,
                    time=time,
                    positions=list(positions),
                    speeds=list(speeds),
                ))
                return True
            return False

    def start(self, record_every: int = 10):
        with self._lock:
            self.is_recording = True
            self.record_every = record_every
            if self.start_step is not None:
                self.frames = []
                self.start_step = None

    def stop(self):
        with self._lock:
            self.is_recording = False

    def clear(self):
        with self._lock:
            self.frames = []
            self.start_step = None

    def export_gltf(self, n_particles: int, box_size: float) -> dict:
        with self._lock:
            frames = list(self.frames)

        if not frames:
            return {}

        n_frames = len(frames)

        accessors = []
        buffer_views = []
        buffers = []
        nodes = []
        meshes = []
        materials = []
        animations = []

        bin_data = bytearray()
        bin_offset = 0

        def add_buffer_view(accessor_data, component_type, count, type_str):
            nonlocal bin_offset, bin_data
            byte_length = len(accessor_data)
            buffer_views.append({
                "buffer": 0,
                "byteOffset": bin_offset,
                "byteLength": byte_length,
                "target": 34962 if type_str in ["VEC3", "VEC2"] else 34963,
            })
            buf_view_idx = len(buffer_views) - 1
            accessors.append({
                "bufferView": buf_view_idx,
                "componentType": component_type,
                "count": count,
                "type": type_str,
            })
            bin_data.extend(accessor_data)
            bin_offset += byte_length
            return len(accessors) - 1

        material_color = [0.0, 0.96, 1.0, 1.0]
        materials.append({
            "pbrMetallicRoughness": {
                "baseColorFactor": material_color,
                "metallicFactor": 0.1,
                "roughnessFactor": 0.2,
            },
            "emissiveFactor": [0.0, 0.3, 0.5],
        })

        static_positions = bytearray()
        for _ in range(n_particles):
            static_positions.extend(struct.pack('<fff', 0.0, 0.0, 0.0))

        add_buffer_view(bytes(static_positions), 5126, n_particles, "VEC3")

        scale = 0.15
        sphere_segments = 4
        sphere_positions = []
        sphere_indices = []

        phi = (1.0 + 5.0 ** 0.5) / 2.0
        ico_vertices = [
            [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
            [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
            [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
        ]
        ico_indices = [
            [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
            [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
            [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
        ]

        for v in ico_vertices:
            v_norm = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5
            sphere_positions.extend([
                v[0] / v_norm * scale,
                v[1] / v_norm * scale,
                v[2] / v_norm * scale,
            ])
        for tri in ico_indices:
            sphere_indices.extend(tri)

        sphere_pos_bytes = bytearray()
        for p in sphere_positions:
            sphere_pos_bytes.extend(struct.pack('<f', p))

        sphere_idx_bytes = bytearray()
        for idx in sphere_indices:
            sphere_idx_bytes.extend(struct.pack('<H', idx))

        add_buffer_view(bytes(sphere_pos_bytes), 5126, len(ico_vertices), "VEC3")
        add_buffer_view(bytes(sphere_idx_bytes), 5123, len(sphere_indices), "SCALAR")

        for i in range(n_particles):
            meshes.append({
                "primitives": [{
                    "attributes": {"POSITION": 1},
                    "indices": 2,
                    "material": 0,
                }]
            })
            nodes.append({
                "mesh": i,
                "translation": [frames[0].positions[i * 3],
                                frames[0].positions[i * 3 + 1],
                                frames[0].positions[i * 3 + 2]],
            })

        if n_frames > 1:
            input_data = bytearray()
            for i in range(n_frames):
                input_data.extend(struct.pack('<f', frames[i].time))
            add_buffer_view(bytes(input_data), 5126, n_frames, "SCALAR")
            time_accessor = len(accessors) - 1

            particle_samplers = []
            for pi in range(n_particles):
                output_data = bytearray()
                for fi in range(n_frames):
                    output_data.extend(struct.pack('<fff',
                        frames[fi].positions[pi * 3],
                        frames[fi].positions[pi * 3 + 1],
                        frames[fi].positions[pi * 3 + 2],
                    ))
                add_buffer_view(bytes(output_data), 5126, n_frames, "VEC3")
                output_accessor = len(accessors) - 1

                particle_samplers.append({
                    "input": time_accessor,
                    "interpolation": "LINEAR",
                    "output": output_accessor,
                })

            samplers_in_anim = []
            channels_in_anim = []

            for pi in range(n_particles):
                samplers_in_anim.append(particle_samplers[pi])
                channels_in_anim.append({
                    "sampler": len(samplers_in_anim) - 1,
                    "target": {
                        "node": pi,
                        "path": "translation",
                    },
                })

            animations.append({
                "samplers": samplers_in_anim,
                "channels": channels_in_anim,
                "name": "particle_trajectory",
            })

        buffers.append({
            "byteLength": len(bin_data),
            "uri": "data:application/octet-stream;base64," + base64.b64encode(bytes(bin_data)).decode('ascii'),
        })

        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "Lennard-Jones Simulator",
            },
            "scene": 0,
            "scenes": [{
                "nodes": list(range(len(nodes))),
                "name": "ParticleScene",
            }],
            "nodes": nodes,
            "meshes": meshes,
            "materials": materials,
            "accessors": accessors,
            "bufferViews": buffer_views,
            "buffers": buffers,
        }

        if animations:
            gltf["animations"] = animations

        return gltf


class SimulationManager:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()
        self._sim_thread: threading.Thread = None
        self._running = False
        self._latest_frame: dict = None
        self._max_subscribers = 50
        self._frame_interval = 0.033
        self._loop: asyncio.AbstractEventLoop = None
        self._simulator: Optional[LJSimulator] = None
        self._recording = RecordingState()

    async def start(self):
        if self._running:
            return
        self._running = True
        self._loop = asyncio.get_event_loop()
        self._sim_thread = threading.Thread(
            target=self._run_simulation, daemon=True
        )
        self._sim_thread.start()
        logger.info("Simulation started")

    def _run_simulation(self):
        params = SimulationParams(
            n_particles=1000,
            box_size=10.0,
            temperature=0.5,
            epsilon=1.0,
            sigma=1.0,
            dt=0.0005,
            r_cut=2.5,
            snapshot_interval=100,
        )
        self._simulator = LJSimulator(params=params, output_dir=str(DATA_DIR))

        while self._running:
            frame = self._simulator.step_forward()
            self._latest_frame = frame

            if self._recording.is_recording:
                self._recording.add_frame(
                    frame["step"],
                    frame["time"],
                    frame["positions"],
                    frame["speeds"],
                )
                frame["recording_frame_added"] = True

            if self._loop and self._subscribers:
                dead_queues = []
                for q in self._subscribers:
                    try:
                        self._loop.call_soon_threadsafe(
                            self._try_put, q, frame
                        )
                    except Exception:
                        dead_queues.append(q)
                for q in dead_queues:
                    self._subscribers.discard(q)

    def _try_put(self, q: asyncio.Queue, frame: dict):
        if q.full():
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            q.put_nowait(frame)
        except asyncio.QueueFull:
            pass

    async def subscribe(self) -> asyncio.Queue:
        async with self._lock:
            if not self._running:
                await self.start()

            if len(self._subscribers) >= self._max_subscribers:
                return None

            q = asyncio.Queue(maxsize=2)
            self._subscribers.add(q)

            if self._latest_frame:
                await q.put(self._latest_frame)

            return q

    async def unsubscribe(self, q: asyncio.Queue):
        async with self._lock:
            self._subscribers.discard(q)

    def set_electric_field(self, E_x: float, E_y: float, E_z: float):
        if self._simulator is not None:
            self._simulator.set_electric_field(E_x, E_y, E_z)
            logger.info(f"Electric field set to ({E_x}, {E_y}, {E_z})")

    def get_electric_field(self) -> tuple:
        if self._simulator is not None:
            return self._simulator.get_electric_field()
        return (0.0, 0.0, 0.0)

    def start_recording(self, record_every: int = 10):
        self._recording.start(record_every)
        logger.info(f"Recording started, capturing every {record_every} steps")

    def stop_recording(self):
        self._recording.stop()
        logger.info(f"Recording stopped, {len(self._recording.frames)} frames captured")

    def get_recording_status(self) -> dict:
        with self._recording._lock:
            return {
                "is_recording": self._recording.is_recording,
                "frame_count": len(self._recording.frames),
                "record_every": self._recording.record_every,
            }

    def export_gltf(self) -> dict:
        if self._simulator is None:
            return {}
        return self._recording.export_gltf(
            self._simulator.n,
            self._simulator.box,
        )

    def clear_recording(self):
        self._recording.clear()
        logger.info("Recording cleared")

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def simulator(self):
        return self._simulator


manager = SimulationManager()


@app.get("/simulate")
async def simulate():
    q = await manager.subscribe()
    if q is None:
        return EventSourceResponse(
            iter(["data: " + json.dumps({"error": "max connections reached"})])
        )

    async def event_generator():
        try:
            while True:
                try:
                    frame = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield json.dumps(frame)
                except asyncio.TimeoutError:
                    yield json.dumps({"type": "heartbeat"})
        except asyncio.CancelledError:
            pass
        finally:
            await manager.unsubscribe(q)

    return EventSourceResponse(event_generator())


@app.get("/electric_field")
async def get_electric_field():
    E_x, E_y, E_z = manager.get_electric_field()
    return {"E_x": E_x, "E_y": E_y, "E_z": E_z}


@app.post("/electric_field")
async def set_electric_field(field: ElectricFieldInput):
    max_field = 50.0
    E_x = max(-max_field, min(max_field, field.E_x))
    E_y = max(-max_field, min(max_field, field.E_y))
    E_z = max(-max_field, min(max_field, field.E_z))
    manager.set_electric_field(E_x, E_y, E_z)
    return {"success": True, "E_x": E_x, "E_y": E_y, "E_z": E_z}


@app.get("/recording")
async def get_recording_status():
    return manager.get_recording_status()


@app.post("/recording/start")
async def start_recording(record_every: int = Query(10, ge=1, le=100)):
    manager.start_recording(record_every)
    return manager.get_recording_status()


@app.post("/recording/stop")
async def stop_recording():
    manager.stop_recording()
    return manager.get_recording_status()


@app.post("/recording/clear")
async def clear_recording():
    manager.clear_recording()
    return manager.get_recording_status()


@app.get("/recording/export/gltf")
async def export_gltf():
    gltf_data = manager.export_gltf()
    if not gltf_data:
        return {"error": "No recording data available"}
    json_str = json.dumps(gltf_data, separators=(',', ':'))
    return Response(
        content=json_str,
        media_type="model/gltf+json",
        headers={
            "Content-Disposition": 'attachment; filename="trajectory.gltf"'
        }
    )


@app.get("/status")
async def status():
    E_x, E_y, E_z = manager.get_electric_field()
    recording = manager.get_recording_status()
    return {
        "subscribers": manager.subscriber_count,
        "running": manager._running,
        "electric_field": {"E_x": E_x, "E_y": E_y, "E_z": E_z},
        "recording": recording,
    }


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    if not FRONTEND_DIST.exists():
        return {"detail": "Frontend not built yet. Run `npm run build` in the frontend directory."}

    requested_path = FRONTEND_DIST / full_path
    if requested_path.is_file() and requested_path.exists():
        return FileResponse(requested_path)

    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return {"detail": "File not found"}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
