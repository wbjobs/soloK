import os
from typing import List, Optional
import numpy as np
import torch
from ultralytics import YOLO


class YOLOTracker:
    def __init__(self, model_path: Optional[str] = None, device: Optional[str] = None):
        self.model_path = model_path or "yolov8n.pt"
        self.device = device or self._auto_detect_device()
        self.model = self._load_model()
        self.person_class_id = 0

    def _auto_detect_device(self) -> str:
        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    def _load_model(self) -> YOLO:
        if not os.path.exists(self.model_path):
            model = YOLO("yolov8n.pt")
        else:
            model = YOLO(self.model_path)

        if self.device != "cpu":
            model.to(self.device)

        return model

    def detect(
        self,
        frame: np.ndarray,
        conf_threshold: float = 0.5,
        iou_threshold: float = 0.45
    ) -> List[List[float]]:
        results = self.model.predict(
            frame,
            conf=conf_threshold,
            iou=iou_threshold,
            device=self.device,
            verbose=False
        )

        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for box in boxes:
                class_id = int(box.cls[0].item())

                if class_id != self.person_class_id:
                    continue

                x1, y1, x2, y2 = box.xyxy[0].tolist()
                confidence = float(box.conf[0].item())

                detections.append([x1, y1, x2, y2, confidence, class_id])

        return detections

    def detect_batch(
        self,
        frames: List[np.ndarray],
        conf_threshold: float = 0.5,
        iou_threshold: float = 0.45
    ) -> List[List[List[float]]]:
        if not frames:
            return []

        results = self.model.predict(
            frames,
            conf=conf_threshold,
            iou=iou_threshold,
            device=self.device,
            verbose=False
        )

        batch_detections = []
        for result in results:
            frame_detections = []
            boxes = result.boxes

            if boxes is not None:
                for box in boxes:
                    class_id = int(box.cls[0].item())

                    if class_id != self.person_class_id:
                        continue

                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    confidence = float(box.conf[0].item())

                    frame_detections.append([x1, y1, x2, y2, confidence, class_id])

            batch_detections.append(frame_detections)

        return batch_detections

    def get_device_info(self) -> dict:
        return {
            "device": self.device,
            "cuda_available": torch.cuda.is_available(),
            "cuda_device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "cuda_device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
        }
