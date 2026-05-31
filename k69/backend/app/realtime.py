import asyncio
import numpy as np
from datetime import datetime, timedelta
from typing import Set, Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect
import json
import random

class RealTimeDataManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._current_time = datetime.now()
        self._sampling_rate = 100
        self._batch_interval = 0.5
        self._data_generator = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        if not self.is_running:
            await self.start_streaming()

    async def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        if len(self.active_connections) == 0 and self.is_running:
            await self.stop_streaming()

    async def broadcast(self, message: Dict):
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.add(connection)
        
        for conn in disconnected:
            self.active_connections.discard(conn)

    def _generate_waveform_point(self, base_time: datetime, offset_ms: int) -> Dict:
        t = offset_ms / 1000.0
        freq1 = 2 + np.random.normal(0, 0.2)
        freq2 = 5 + np.random.normal(0, 0.3)
        
        wave1 = np.sin(2 * np.pi * freq1 * t) * np.exp(-t / 5)
        wave2 = 0.3 * np.sin(2 * np.pi * freq2 * t) * np.exp(-t / 3)
        noise = np.random.normal(0, 0.05)
        
        amplitude = wave1 + wave2 + noise
        
        if random.random() < 0.002:
            amplitude += random.choice([1, -1]) * np.random.uniform(0.5, 1.5)
        
        timestamp = base_time + timedelta(milliseconds=offset_ms)
        
        return {
            "timestamp": timestamp.isoformat(),
            "amplitude": float(amplitude)
        }

    async def _streaming_loop(self):
        while self.is_running and len(self.active_connections) > 0:
            try:
                batch_data = []
                base_time = datetime.now()
                
                points_per_batch = int(self._sampling_rate * self._batch_interval)
                interval_ms = int(1000 / self._sampling_rate)
                
                for i in range(points_per_batch):
                    point = self._generate_waveform_point(base_time, i * interval_ms)
                    batch_data.append(point)
                
                message = {
                    "type": "waveform_data",
                    "data": batch_data,
                    "timestamp": datetime.now().isoformat(),
                    "points_count": len(batch_data)
                }
                
                await self.broadcast(message)
                await asyncio.sleep(self._batch_interval)
                
            except Exception as e:
                print(f"Streaming error: {e}")
                await asyncio.sleep(1)
        
        self.is_running = False

    async def start_streaming(self):
        if self.is_running:
            return
        self.is_running = True
        self._current_time = datetime.now()
        self._task = asyncio.create_task(self._streaming_loop())
        print(f"Started real-time streaming with {len(self.active_connections)} connections")

    async def stop_streaming(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        print("Stopped real-time streaming")

    async def send_heartbeat(self):
        message = {
            "type": "heartbeat",
            "timestamp": datetime.now().isoformat(),
            "connections": len(self.active_connections)
        }
        await self.broadcast(message)

    def get_status(self) -> Dict:
        return {
            "is_running": self.is_running,
            "active_connections": len(self.active_connections),
            "sampling_rate": self._sampling_rate,
            "batch_interval": self._batch_interval
        }

    def set_sampling_rate(self, rate: int):
        self._sampling_rate = max(10, min(1000, rate))

    def set_batch_interval(self, interval: float):
        self._batch_interval = max(0.1, min(2.0, interval))

class WebSocketHandler:
    def __init__(self, data_manager: RealTimeDataManager):
        self.data_manager = data_manager

    async def handle_connection(self, websocket: WebSocket):
        await self.data_manager.connect(websocket)
        try:
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                    message = json.loads(data)
                    await self.handle_message(websocket, message)
                except asyncio.TimeoutError:
                    await self.data_manager.send_heartbeat()
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    print(f"WebSocket error: {e}")
                    break
        finally:
            await self.data_manager.disconnect(websocket)

    async def handle_message(self, websocket: WebSocket, message: Dict):
        msg_type = message.get('type', '')
        
        if msg_type == 'ping':
            await websocket.send_json({
                "type": "pong",
                "timestamp": datetime.now().isoformat()
            })
        
        elif msg_type == 'config':
            if 'sampling_rate' in message:
                self.data_manager.set_sampling_rate(message['sampling_rate'])
            if 'batch_interval' in message:
                self.data_manager.set_batch_interval(message['batch_interval'])
            
            await websocket.send_json({
                "type": "config_ack",
                "status": self.data_manager.get_status()
            })
        
        elif msg_type == 'status':
            await websocket.send_json({
                "type": "status",
                "status": self.data_manager.get_status()
            })
