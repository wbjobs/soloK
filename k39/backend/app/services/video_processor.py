import os
from typing import List, Dict, Optional, Tuple
import numpy as np
import cv2

from app.core.database import SessionLocal
from app.models.tracking_data import TrackingData
from app.utils.yolo_detector import YOLOTracker
from app.utils.deepsort_tracker import DeepSORTTracker
from app.utils.video_utils import get_video_info, get_video_frames_generator


class VideoProcessor:
    def __init__(self, yolo_model_path: Optional[str] = None, camera_ids: Optional[List[str]] = None):
        self.yolo_detector = YOLOTracker(model_path=yolo_model_path)
        self.camera_ids = camera_ids or ["camera_0"]
        self.trackers: Dict[str, DeepSORTTracker] = {}
        self._init_trackers()

    def _init_trackers(self) -> None:
        for camera_id in self.camera_ids:
            self.trackers[camera_id] = DeepSORTTracker()

    def process_video(self, video_path: str, match_id: int, camera_id: Optional[str] = None) -> Dict:
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        camera_id = camera_id or self.camera_ids[0]
        if camera_id not in self.trackers:
            self.trackers[camera_id] = DeepSORTTracker()

        video_info = get_video_info(video_path)
        fps = video_info["fps"]
        total_frames = video_info["frame_count"]

        results = {
            "match_id": match_id,
            "camera_id": camera_id,
            "total_frames": total_frames,
            "fps": fps,
            "processed_frames": 0,
            "tracking_ids": set()
        }

        for frame_num, frame in enumerate(get_video_frames_generator(video_path, sample_rate=1)):
            timestamp = frame_num / fps

            detections = self.detect_players(frame)
            tracking_results = self.track_players(detections, frame, camera_id)
            self.save_tracking_data(tracking_results, frame_num, timestamp, match_id, camera_id)

            for track in tracking_results:
                results["tracking_ids"].add(track["track_id"])

            results["processed_frames"] = frame_num + 1

        results["tracking_ids"] = list(results["tracking_ids"])
        results["total_tracks"] = len(results["tracking_ids"])

        return results

    def extract_frames(self, video_path: str, sample_rate: int = 1) -> List[Tuple[int, np.ndarray, float]]:
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        video_info = get_video_info(video_path)
        fps = video_info["fps"]

        frames = []
        for frame_num, frame in enumerate(get_video_frames_generator(video_path, sample_rate=sample_rate)):
            timestamp = frame_num * sample_rate / fps
            frames.append((frame_num * sample_rate, frame, timestamp))

        return frames

    def detect_players(self, frame: np.ndarray, conf_threshold: float = 0.5, iou_threshold: float = 0.45) -> List[List[float]]:
        return self.yolo_detector.detect(frame, conf_threshold=conf_threshold, iou_threshold=iou_threshold)

    def track_players(self, detections: List[List[float]], frame: np.ndarray, camera_id: str) -> List[Dict]:
        if camera_id not in self.trackers:
            self.trackers[camera_id] = DeepSORTTracker()

        tracker = self.trackers[camera_id]
        tracker.update(detections, frame)
        tracks = tracker.get_tracks()

        results = []
        for track in tracks:
            x1, y1, x2, y2 = track["bbox"]
            center_x = (x1 + x2) / 2
            center_y = (y1 + y2) / 2

            results.append({
                "track_id": track["track_id"],
                "x": center_x,
                "y": center_y,
                "bbox": [x1, y1, x2, y2],
                "confidence": track["confidence"],
                "team": "unknown"
            })

        return results

    def save_tracking_data(
        self,
        tracking_results: List[Dict],
        frame_num: int,
        timestamp: float,
        match_id: int,
        camera_id: str
    ) -> None:
        db = SessionLocal()
        try:
            for result in tracking_results:
                tracking_data = TrackingData(
                    match_id=match_id,
                    frame_number=frame_num,
                    timestamp=timestamp,
                    x=result["x"],
                    y=result["y"],
                    team=result["team"],
                    camera_id=camera_id
                )
                db.add(tracking_data)
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    def reset_tracker(self, camera_id: Optional[str] = None) -> None:
        if camera_id:
            if camera_id in self.trackers:
                self.trackers[camera_id] = DeepSORTTracker()
        else:
            self._init_trackers()

    def process_multicamera(
        self,
        video_paths: Dict[str, str],
        match_id: int
    ) -> Dict[str, Dict]:
        results = {}
        for camera_id, video_path in video_paths.items():
            if camera_id not in self.trackers:
                self.trackers[camera_id] = DeepSORTTracker()

            results[camera_id] = self.process_video(video_path, match_id, camera_id)

        return results
