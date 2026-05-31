import numpy as np
from typing import List, Tuple, Optional, Dict
from app.utils.line_detector import LineDetector
from app.utils.homography import HomographyTransformer
from app.utils.pitch_template import PITCH_DIMENSIONS, get_standard_pitch_points


class PitchAnalyzer:
    def __init__(self):
        self.line_detector = LineDetector()
        self.homography = HomographyTransformer()
        self.video_info: Optional[Dict] = None
        self.is_calibrated: bool = False
        self.detected_lines: Dict[str, List] = {}

    def calibrate(self, first_frame: np.ndarray, video_info: Dict) -> bool:
        self.video_info = video_info

        sidelines = self.line_detector.detect_sidelines(first_frame)
        penalty_lines = self.line_detector.detect_penalty_area(first_frame)
        center_lines = self.line_detector.detect_center_circle(first_frame)
        goal_lines = self.line_detector.detect_goal_area(first_frame)

        self.detected_lines = {
            "sidelines": sidelines,
            "penalty_area": penalty_lines,
            "center_circle": center_lines,
            "goal_area": goal_lines,
        }

        line_points = self._extract_line_points(sidelines + penalty_lines + center_lines + goal_lines)

        if len(line_points) >= 8:
            standard_points = get_standard_pitch_points()
            src_points, dst_points = self._match_points(line_points, standard_points)

            if len(src_points) >= 4 and len(dst_points) >= 4:
                self.homography.compute_matrix(src_points, dst_points)
                self.is_calibrated = self.homography.is_calibrated()

        return self.is_calibrated

    def detect_lines(self, frame: np.ndarray) -> Dict[str, List[Tuple[float, float, float, float]]]:
        sidelines = self.line_detector.detect_sidelines(frame)
        penalty_lines = self.line_detector.detect_penalty_area(frame)
        center_lines = self.line_detector.detect_center_circle(frame)
        goal_lines = self.line_detector.detect_goal_area(frame)

        self.detected_lines = {
            "sidelines": sidelines,
            "penalty_area": penalty_lines,
            "center_circle": center_lines,
            "goal_area": goal_lines,
        }

        return self.detected_lines

    def compute_homography(
        self, line_points: List[Tuple[float, float]]
    ) -> Optional[np.ndarray]:
        if len(line_points) < 4:
            return None

        standard_points = get_standard_pitch_points()
        src_points, dst_points = self._match_points(line_points, standard_points)

        if len(src_points) >= 4 and len(dst_points) >= 4:
            matrix = self.homography.compute_matrix(src_points, dst_points)
            self.is_calibrated = self.homography.is_calibrated()
            return matrix

        return None

    def transform_coordinates(self, x: float, y: float) -> Tuple[float, float]:
        if not self.is_calibrated:
            raise ValueError("Pitch analyzer not calibrated. Call calibrate first.")
        return self.homography.transform_point(x, y)

    def get_pitch_dimensions(self) -> Tuple[float, float]:
        return PITCH_DIMENSIONS

    def _extract_line_points(
        self, lines: List[Tuple[float, float, float, float]]
    ) -> List[Tuple[float, float]]:
        points = []
        for x1, y1, x2, y2 in lines:
            points.append((float(x1), float(y1)))
            points.append((float(x2), float(y2)))
        return points

    def _match_points(
        self,
        video_points: List[Tuple[float, float]],
        standard_points: Dict[str, Tuple[float, float]],
    ) -> Tuple[List[Tuple[float, float]], List[Tuple[float, float]]]:
        if self.video_info is None:
            return [], []

        h, w = self.video_info.get("height"), self.video_info.get("width")
        if h is None or w is None:
            return [], []

        corners = [
            (0, 0),
            (w, 0),
            (0, h),
            (w, h),
        ]

        standard_corners = [
            standard_points["top_left"],
            standard_points["top_right"],
            standard_points["bottom_left"],
            standard_points["bottom_right"],
        ]

        src_points = []
        dst_points = []

        for video_corner, standard_corner in zip(corners, standard_corners):
            closest = self._find_closest_point(video_corner, video_points)
            if closest is not None:
                src_points.append(closest)
                dst_points.append(standard_corner)

        if len(src_points) >= 4:
            video_center = (w / 2, h / 2)
            closest_center = self._find_closest_point(video_center, video_points)
            if closest_center is not None:
                src_points.append(closest_center)
                dst_points.append(standard_points["center_spot"])

        return src_points, dst_points

    def _find_closest_point(
        self,
        target: Tuple[float, float],
        points: List[Tuple[float, float]],
        threshold: float = 50.0,
    ) -> Optional[Tuple[float, float]]:
        if not points:
            return None

        min_dist = float("inf")
        closest = None

        for point in points:
            dist = np.sqrt((target[0] - point[0]) ** 2 + (target[1] - point[1]) ** 2)
            if dist < min_dist and dist < threshold:
                min_dist = dist
                closest = point

        return closest
