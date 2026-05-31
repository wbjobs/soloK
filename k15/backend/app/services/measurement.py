import numpy as np
import math
import cv2
from typing import Tuple, Optional, Dict, List
from app.core.logging import logger
from app.config import settings


class SonarMeasurementService:
    def __init__(
        self,
        speed_of_sound: Optional[float] = None,
        scan_angle: Optional[float] = None,
    ):
        self.speed_of_sound = speed_of_sound or settings.sonar_speed_of_sound
        self.scan_angle = scan_angle or settings.sonar_scan_angle
        self.scan_radians = math.radians(self.scan_angle)

    def calculate_range_from_samples(
        self,
        sample_index: float,
        total_samples: int,
        max_range: float,
    ) -> float:
        return (sample_index / max(total_samples, 1)) * max_range

    def calculate_resolution_per_sample(
        self,
        total_samples: int,
        max_range: float,
    ) -> float:
        return max_range / max(total_samples, 1)

    def calculate_pixel_to_meters(
        self,
        pixel_distance: float,
        image_width: int,
        max_range: float,
    ) -> float:
        resolution = self.calculate_resolution_per_sample(image_width, max_range)
        return pixel_distance * resolution

    def _detect_target_orientation(
        self,
        image: np.ndarray,
        bbox: Tuple[int, int, int, int],
    ) -> Dict:
        x, y, w, h = bbox
        x1 = max(0, x)
        y1 = max(0, y)
        x2 = min(image.shape[1], x + w)
        y2 = min(image.shape[0], y + h)

        if x2 <= x1 or y2 <= y1:
            return {
                "angle_degrees": 0.0,
                "angle_radians": 0.0,
                "length_pixels": max(w, h),
                "width_pixels": min(w, h),
                "is_rotated": False,
                "confidence": 0.0,
            }

        roi = image[y1:y2, x1:x2]

        try:
            if len(roi.shape) == 3:
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            else:
                gray = roi

            _, binary = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

            contours, _ = cv2.findContours(
                binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            if not contours:
                return {
                    "angle_degrees": 0.0,
                    "angle_radians": 0.0,
                    "length_pixels": max(w, h),
                    "width_pixels": min(w, h),
                    "is_rotated": False,
                    "confidence": 0.0,
                }

            largest_contour = max(contours, key=cv2.contourArea)

            if len(largest_contour) < 5:
                return {
                    "angle_degrees": 0.0,
                    "angle_radians": 0.0,
                    "length_pixels": max(w, h),
                    "width_pixels": min(w, h),
                    "is_rotated": False,
                    "confidence": 0.0,
                }

            ellipse = cv2.fitEllipse(largest_contour)
            (cx, cy), (major_axis, minor_axis), angle = ellipse

            rect = cv2.minAreaRect(largest_contour)
            (_, _), (rect_w, rect_h), rect_angle = rect

            if rect_w > rect_h:
                length = rect_w
                width = rect_h
            else:
                length = rect_h
                width = rect_w
                rect_angle += 90.0

            if rect_angle > 90:
                rect_angle -= 180
            elif rect_angle < -90:
                rect_angle += 180

            contour_area = cv2.contourArea(largest_contour)
            bounding_area = length * width
            fill_ratio = contour_area / max(bounding_area, 1)

            orientation_confidence = min(1.0, fill_ratio * 1.5) if fill_ratio > 0.3 else 0.3

            is_rotated = abs(rect_angle) > 5.0 and abs(rect_angle) < 85.0

            return {
                "angle_degrees": round(rect_angle, 2),
                "angle_radians": round(math.radians(rect_angle), 4),
                "length_pixels": round(length, 2),
                "width_pixels": round(width, 2),
                "is_rotated": is_rotated,
                "confidence": round(orientation_confidence, 3),
                "fill_ratio": round(fill_ratio, 3),
                "ellipse_major": round(major_axis, 2),
                "ellipse_minor": round(minor_axis, 2),
            }

        except Exception as e:
            logger.debug(f"Orientation detection error: {e}")
            return {
                "angle_degrees": 0.0,
                "angle_radians": 0.0,
                "length_pixels": max(w, h),
                "width_pixels": min(w, h),
                "is_rotated": False,
                "confidence": 0.0,
            }

    def _correct_for_perspective(
        self,
        measured_length: float,
        measured_width: float,
        angle_radians: float,
        center_range: float,
        max_range: float,
    ) -> Dict:
        if abs(angle_radians) < 0.01:
            return {
                "corrected_length": measured_length,
                "corrected_width": measured_width,
                "correction_factor_length": 1.0,
                "correction_factor_width": 1.0,
                "applied": False,
            }

        range_ratio = center_range / max(max_range, 0.1)
        perspective_factor = 1.0 + 0.5 * (1.0 - range_ratio)

        cos_angle = math.cos(angle_radians)
        sin_angle = math.sin(angle_radians)

        length_correction = 1.0 / max(abs(cos_angle), 0.1)
        width_correction = 1.0 / max(abs(sin_angle), 0.1)

        length_correction = min(length_correction, 10.0)
        width_correction = min(width_correction, 10.0)

        corrected_length = measured_length * length_correction * perspective_factor
        corrected_width = measured_width * width_correction * perspective_factor

        return {
            "corrected_length": round(corrected_length, 4),
            "corrected_width": round(corrected_width, 4),
            "correction_factor_length": round(length_correction, 4),
            "correction_factor_width": round(width_correction, 4),
            "perspective_factor": round(perspective_factor, 4),
            "applied": True,
        }

    def calculate_target_size(
        self,
        bbox: Tuple[int, int, int, int],
        image_shape: Tuple[int, int],
        max_range: float,
        center_sample: Optional[int] = None,
        image: Optional[np.ndarray] = None,
    ) -> Dict:
        x, y, w, h = bbox
        img_h, img_w = image_shape

        resolution = self.calculate_resolution_per_sample(img_w, max_range)

        raw_length_meters = w * resolution
        raw_width_meters = h * resolution

        if center_sample is None:
            center_sample = x + w / 2

        range_distance = self.calculate_range_from_samples(
            int(center_sample), img_w, max_range
        )

        along_track_resolution = max_range / max(img_h, 1)
        along_track_length = h * along_track_resolution

        cross_track_width = w * resolution

        orientation = None
        perspective_correction = None
        corrected_length = raw_length_meters
        corrected_width = raw_width_meters

        if image is not None:
            orientation = self._detect_target_orientation(image, bbox)

            if orientation["is_rotated"] and orientation["confidence"] > 0.3:
                oriented_length_pix = orientation["length_pixels"]
                oriented_width_pix = orientation["width_pixels"]

                oriented_length = oriented_length_pix * resolution
                oriented_width = oriented_width_pix * resolution

                perspective_correction = self._correct_for_perspective(
                    oriented_length,
                    oriented_width,
                    orientation["angle_radians"],
                    range_distance,
                    max_range,
                )

                if perspective_correction["applied"]:
                    corrected_length = perspective_correction["corrected_length"]
                    corrected_width = perspective_correction["corrected_width"]
                else:
                    corrected_length = oriented_length
                    corrected_width = oriented_width

        return {
            "length_meters": round(corrected_length, 3),
            "width_meters": round(corrected_width, 3),
            "raw_length_meters": round(raw_length_meters, 3),
            "raw_width_meters": round(raw_width_meters, 3),
            "along_track_length_meters": round(along_track_length, 3),
            "cross_track_width_meters": round(cross_track_width, 3),
            "range_distance_meters": round(range_distance, 3),
            "orientation": orientation,
            "perspective_correction": perspective_correction,
            "corrected": orientation is not None and orientation["is_rotated"],
            "bbox_pixels": {"x": x, "y": y, "width": w, "height": h},
            "image_info": {
                "width": img_w,
                "height": img_h,
                "max_range": max_range,
                "resolution_per_sample": round(resolution, 4),
            },
        }

    def calculate_depth_from_twoway_travel(
        self,
        two_way_travel_time: float,
    ) -> float:
        return (self.speed_of_sound * two_way_travel_time) / 2.0

    def calculate_angular_position(
        self,
        sample_index: int,
        total_samples: int,
    ) -> float:
        normalized = (sample_index / max(total_samples, 1)) * 2 - 1
        normalized = max(-1.0, min(1.0, normalized))
        return math.degrees(math.asin(normalized))

    def calculate_position_offset(
        self,
        range_distance: float,
        angle_degrees: float,
    ) -> Tuple[float, float]:
        angle_rad = math.radians(angle_degrees)
        x_offset = range_distance * math.sin(angle_rad)
        y_offset = range_distance * math.cos(angle_rad)
        return round(x_offset, 3), round(y_offset, 3)

    def estimate_target_dimensions_from_signal(
        self,
        signal_amplitudes: np.ndarray,
        center_index: int,
        total_samples: int,
        max_range: float,
        threshold_ratio: float = 0.5,
    ) -> Dict:
        if len(signal_amplitudes) == 0:
            return {"length": 0, "width": 0}

        peak = (
            signal_amplitudes[center_index]
            if center_index < len(signal_amplitudes)
            else signal_amplitudes.max()
        )
        threshold = peak * threshold_ratio

        above_threshold = np.where(signal_amplitudes >= threshold)[0]

        if len(above_threshold) == 0:
            return {"length": 0, "width": 0}

        left_bound = above_threshold[0]
        right_bound = above_threshold[-1]

        pixel_width = right_bound - left_bound
        resolution = self.calculate_resolution_per_sample(total_samples, max_range)

        return {
            "length": round(pixel_width * resolution, 3),
            "width": round(pixel_width * resolution * 0.5, 3),
            "pixel_bounds": {"left": int(left_bound), "right": int(right_bound)},
        }

    def generate_measurement_report(
        self,
        detections: list,
        image_shape: Tuple[int, int],
        max_range: float,
        image: Optional[np.ndarray] = None,
    ) -> list:
        reports = []
        for det in detections:
            if hasattr(det, 'bbox'):
                bbox = det.bbox
            elif isinstance(det, dict):
                bbox = det.get("bbox", (0, 0, 0, 0))
                if isinstance(bbox, dict):
                    bbox = (bbox.get("x", 0), bbox.get("y", 0), bbox.get("width", 0), bbox.get("height", 0))
            else:
                continue

            measurement = self.calculate_target_size(bbox, image_shape, max_range, image=image)
            if hasattr(det, 'class_name'):
                measurement["class_name"] = det.class_name
            elif isinstance(det, dict):
                measurement["class_name"] = det.get("class_name", "unknown")
            if hasattr(det, 'confidence'):
                measurement["confidence"] = det.confidence
            elif isinstance(det, dict):
                measurement["confidence"] = det.get("confidence", 0)

            reports.append(measurement)

        return reports

    def evaluate_measurement_accuracy(
        self,
        measured_dims: Tuple[float, float],
        ground_truth: Tuple[float, float],
    ) -> Dict:
        m_len, m_wid = measured_dims
        gt_len, gt_wid = ground_truth

        length_error = abs(m_len - gt_len) / max(gt_len, 0.001) * 100
        width_error = abs(m_wid - gt_wid) / max(gt_wid, 0.001) * 100

        avg_error = (length_error + width_error) / 2

        return {
            "length_error_percent": round(length_error, 2),
            "width_error_percent": round(width_error, 2),
            "average_error_percent": round(avg_error, 2),
            "within_10_percent": avg_error <= 10.0,
            "within_20_percent": avg_error <= 20.0,
            "within_50_percent": avg_error <= 50.0,
        }


measurement_service = SonarMeasurementService()
