import threading
import time
from typing import Optional, Dict, Any, Callable, List
from datetime import datetime

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.services.event_detector import EventDetector
from app.services.pitch_analyzer import PitchAnalyzer


class LiveStreamProcessor:
    """直播流处理器，支持RTSP/RTMP流的异步处理、帧率控制和丢帧策略。"""

    def __init__(
        self,
        stream_url: str,
        stream_type: str = 'rtsp',
        match_id: Optional[int] = None,
        user_id: Optional[int] = None,
        db: Optional[Session] = None
    ) -> None:
        """
        初始化直播流处理器。

        Args:
            stream_url: 流媒体URL地址。
            stream_type: 流类型，支持 'rtsp' 或 'rtmp'，默认 'rtsp'。
            match_id: 关联的比赛ID，可选。
            user_id: 关联的用户ID，可选。
            db: 数据库会话，可选。
        """
        self.stream_url = stream_url
        self.stream_type = stream_type
        self.match_id = match_id
        self.user_id = user_id
        self.db = db

        self.connected_at: Optional[datetime] = None
        self.frames_processed: int = 0
        self.events_detected: int = 0
        self.is_running: bool = False

        self._cap: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._data_callback: Optional[Callable[[Dict[str, Any]], None]] = None
        self._lock = threading.Lock()

        self._target_fps: float = 25.0
        self._frame_skip_threshold: int = 3
        self._reconnect_attempts: int = 5
        self._reconnect_delay: float = 2.0

        self._event_detector: Optional[EventDetector] = None
        self._pitch_analyzer = PitchAnalyzer()

    def start(self) -> Dict[str, Any]:
        """
        启动流处理，在独立线程中异步读取和处理视频帧。

        Returns:
            启动状态信息字典。
        """
        if self.is_running:
            return {
                'status': 'already_running',
                'message': 'Stream processor is already running',
            }

        self._stop_event.clear()
        self.is_running = True
        self.connected_at = datetime.utcnow()

        self._thread = threading.Thread(
            target=self._processing_loop,
            daemon=True,
            name=f"stream-{self.match_id or 'unknown'}",
        )
        self._thread.start()

        return {
            'status': 'started',
            'stream_url': self.stream_url,
            'stream_type': self.stream_type,
            'connected_at': self.connected_at.isoformat(),
        }

    def stop(self) -> Dict[str, Any]:
        """
        停止流处理，释放资源。

        Returns:
            停止状态信息字典，包含已处理帧数和检测事件数。
        """
        if not self.is_running:
            return {
                'status': 'not_running',
                'message': 'Stream processor is not running',
            }

        self._stop_event.set()
        self.is_running = False

        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=5.0)

        self._release_capture()

        result = {
            'status': 'stopped',
            'frames_processed': self.frames_processed,
            'events_detected': self.events_detected,
            'connected_at': self.connected_at.isoformat() if self.connected_at else None,
            'stopped_at': datetime.utcnow().isoformat(),
        }

        return result

    def set_data_callback(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """
        设置数据回调函数，每帧处理完成后调用。

        Args:
            callback: 回调函数，接收包含帧处理结果的字典。
        """
        self._data_callback = callback

    def get_status(self) -> Dict[str, Any]:
        """
        获取当前处理状态。

        Returns:
            包含流URL、运行状态、帧计数等信息的字典。
        """
        uptime = None
        if self.connected_at and self.is_running:
            uptime = (datetime.utcnow() - self.connected_at).total_seconds()

        return {
            'stream_url': self.stream_url,
            'stream_type': self.stream_type,
            'match_id': self.match_id,
            'user_id': self.user_id,
            'is_running': self.is_running,
            'connected_at': self.connected_at.isoformat() if self.connected_at else None,
            'frames_processed': self.frames_processed,
            'events_detected': self.events_detected,
            'uptime_seconds': uptime,
            'target_fps': self._target_fps,
        }

    def _processing_loop(self) -> None:
        """
        主处理循环，在线程中运行。负责连接流、读取帧并处理。

        包含重连机制，连接断开时会尝试多次重连。
        """
        attempts = 0

        while not self._stop_event.is_set() and attempts < self._reconnect_attempts:
            if not self._connect():
                attempts += 1
                if attempts < self._reconnect_attempts:
                    time.sleep(self._reconnect_delay)
                continue

            attempts = 0
            frame_interval = 1.0 / self._target_fps if self._target_fps > 0 else 0
            last_frame_time = time.time()

            while not self._stop_event.is_set():
                current_time = time.time()
                elapsed = current_time - last_frame_time

                if elapsed < frame_interval:
                    time.sleep(min(frame_interval - elapsed, 0.01))
                    continue

                ret, frame = self._cap.read()

                if not ret or frame is None:
                    break

                last_frame_time = current_time

                if self._should_skip_frame():
                    continue

                self._process_frame(frame)

            self._release_capture()

            if not self._stop_event.is_set():
                attempts += 1
                if attempts < self._reconnect_attempts:
                    time.sleep(self._reconnect_delay)

        self.is_running = False

    def _process_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        处理单帧图像，执行球员检测、事件检测等任务。

        Args:
            frame: BGR格式的视频帧。

        Returns:
            帧处理结果字典。
        """
        with self._lock:
            self.frames_processed += 1

        frame_number = self.frames_processed
        timestamp = time.time()

        result: Dict[str, Any] = {
            'frame_number': frame_number,
            'timestamp': timestamp,
            'stream_url': self.stream_url,
            'match_id': self.match_id,
            'frame_shape': frame.shape,
            'events': [],
        }

        if self._event_detector is not None and self.match_id is not None:
            events = self._event_detector.detect_events([], {
                'timestamp': timestamp,
                'frame_number': frame_number,
            })
            if events:
                result['events'] = events
                with self._lock:
                    self.events_detected += len(events)

        if self._data_callback is not None:
            try:
                self._data_callback(result)
            except Exception:
                pass

        return result

    def _connect(self) -> bool:
        """
        连接到流媒体源。

        Returns:
            连接是否成功。
        """
        try:
            if self.stream_type == 'rtsp':
                self._cap = cv2.VideoCapture(self.stream_url, cv2.CAP_FFMPEG)
            elif self.stream_type == 'rtmp':
                self._cap = cv2.VideoCapture(self.stream_url, cv2.CAP_FFMPEG)
            else:
                self._cap = cv2.VideoCapture(self.stream_url)

            if not self._cap.isOpened():
                self._cap = None
                return False

            self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            return True
        except Exception:
            self._cap = None
            return False

    def _release_capture(self) -> None:
        """释放VideoCapture资源。"""
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None

    def _should_skip_frame(self) -> bool:
        """
        判断是否应跳过当前帧以跟上实时流速度。

        Returns:
            是否跳过当前帧。
        """
        if self._cap is None:
            return False

        buffer_size = int(self._cap.get(cv2.CAP_PROP_POS_FRAMES))
        total = int(self._cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if total > 0 and buffer_size > 0:
            lag = buffer_size / max(self._target_fps, 1.0)
            if lag > self._frame_skip_threshold:
                return True

        return False
