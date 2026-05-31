import numpy as np
import cv2
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from app.core.logging import logger
from app.config import settings

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logger.warning("Ultralytics YOLO not installed. Using fallback detector.")


@dataclass
class DetectionResult:
    class_name: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    center: Tuple[int, int]


class SonarObjectDetector:
    CLASS_NAMES = ["shipwreck", "pipeline", "reef", "fish_school"]
    CLASS_COLORS = {
        "shipwreck": (255, 0, 0),
        "pipeline": (0, 255, 0),
        "reef": (255, 255, 0),
        "fish_school": (0, 255, 255),
    }

    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.model_loaded = False
        model_path = model_path or settings.yolo_model_path

        if YOLO_AVAILABLE:
            try:
                self.model = YOLO(model_path)
                self.model_loaded = True
                logger.info(f"YOLO model loaded from: {model_path}")
            except Exception as e:
                logger.error(f"Failed to load YOLO model: {e}. Using fallback.")

    def detect(
        self,
        image: np.ndarray,
        conf_threshold: float = 0.3,
        iou_threshold: float = 0.45,
    ) -> List[DetectionResult]:
        if not self.model_loaded:
            return self._fallback_detect(image)

        try:
            if len(image.shape) == 2:
                rgb_image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            else:
                rgb_image = image

            results = self.model.predict(
                rgb_image,
                conf=conf_threshold,
                iou=iou_threshold,
                verbose=False,
            )

            detections = []
            if results and len(results) > 0:
                result = results[0]
                if result.boxes is not None:
                    for box in result.boxes:
                        xyxy = box.xyxy[0].cpu().numpy().astype(int)
                        cls_id = int(box.cls[0].cpu().numpy())
                        conf = float(box.conf[0].cpu().numpy())

                        class_name = (
                            self.CLASS_NAMES[cls_id]
                            if cls_id < len(self.CLASS_NAMES)
                            else "unknown"
                        )

                        detections.append(
                            DetectionResult(
                                class_name=class_name,
                                confidence=conf,
                                bbox=(
                                    int(xyxy[0]),
                                    int(xyxy[1]),
                                    int(xyxy[2] - xyxy[0]),
                                    int(xyxy[3] - xyxy[1]),
                                ),
                                center=(
                                    int((xyxy[0] + xyxy[2]) / 2),
                                    int((xyxy[1] + xyxy[3]) / 2),
                                ),
                            )
                        )

            return detections

        except Exception as e:
            logger.error(f"Detection error: {e}")
            return self._fallback_detect(image)

    def _fallback_detect(self, image: np.ndarray) -> List[DetectionResult]:
        detections = []
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image

            _, binary = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

            contours, _ = cv2.findContours(
                binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            for contour in contours:
                area = cv2.contourArea(contour)
                if area < 100:
                    continue

                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / h if h > 0 else 0
                extent = area / (w * h) if (w * h) > 0 else 0

                if aspect_ratio > 3.0:
                    class_name = "pipeline"
                elif extent < 0.3:
                    class_name = "reef"
                elif aspect_ratio > 0.8 and aspect_ratio < 1.5:
                    class_name = "fish_school"
                else:
                    class_name = "shipwreck"

                detections.append(
                    DetectionResult(
                        class_name=class_name,
                        confidence=0.5 + (extent * 0.3),
                        bbox=(x, y, w, h),
                        center=(x + w // 2, y + h // 2),
                    )
                )

            return detections[:10]

        except Exception as e:
            logger.error(f"Fallback detection error: {e}")
            return []

    def draw_detections(
        self, image: np.ndarray, detections: List[DetectionResult]
    ) -> np.ndarray:
        annotated = image.copy()
        if len(annotated.shape) == 2:
            annotated = cv2.cvtColor(annotated, cv2.COLOR_GRAY2BGR)

        for det in detections:
            x, y, w, h = det.bbox
            color = self.CLASS_COLORS.get(det.class_name, (0, 0, 255))

            cv2.rectangle(annotated, (x, y), (x + w, y + h), color, 2)
            label = f"{det.class_name} {det.confidence:.2f}"
            label_y = y - 10 if y > 20 else y + h + 15
            cv2.putText(
                annotated,
                label,
                (x, label_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                cv2.LINE_AA,
            )

        return annotated


detector = SonarObjectDetector()
