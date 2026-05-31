import numpy as np
import cv2
from typing import List, Tuple, Optional


class LineDetector:
    def __init__(
        self,
        canny_threshold1: int = 50,
        canny_threshold2: int = 150,
        hough_threshold: int = 100,
        min_line_length: int = 100,
        max_line_gap: int = 10,
    ):
        self.canny_threshold1 = canny_threshold1
        self.canny_threshold2 = canny_threshold2
        self.hough_threshold = hough_threshold
        self.min_line_length = min_line_length
        self.max_line_gap = max_line_gap

    def _create_green_mask(self, frame: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower_green = np.array([35, 40, 40])
        upper_green = np.array([85, 255, 255])
        mask = cv2.inRange(hsv, lower_green, upper_green)
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        return mask

    def _detect_edges(self, frame: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if mask is not None:
            gray = cv2.bitwise_and(gray, gray, mask=mask)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, self.canny_threshold1, self.canny_threshold2)
        return edges

    def _hough_lines(self, edges: np.ndarray) -> List[Tuple[float, float, float, float]]:
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=self.hough_threshold,
            minLineLength=self.min_line_length,
            maxLineGap=self.max_line_gap,
        )
        if lines is None:
            return []
        return [(x1, y1, x2, y2) for line in lines for x1, y1, x2, y2 in line]

    def _filter_lines_by_angle(
        self, lines: List[Tuple[float, float, float, float]], angle_range: Tuple[float, float]
    ) -> List[Tuple[float, float, float, float]]:
        filtered = []
        for x1, y1, x2, y2 in lines:
            angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
            angle = abs(angle) % 180
            if angle_range[0] <= angle <= angle_range[1] or (180 - angle_range[1] <= angle <= 180 - angle_range[0]):
                filtered.append((x1, y1, x2, y2))
        return filtered

    def _merge_lines(
        self, lines: List[Tuple[float, float, float, float]], threshold: float = 30
    ) -> List[Tuple[float, float, float, float]]:
        if not lines:
            return []
        merged = []
        lines = sorted(lines, key=lambda l: np.sqrt((l[2] - l[0]) ** 2 + (l[3] - l[1]) ** 2), reverse=True)
        for line in lines:
            x1, y1, x2, y2 = line
            merged_flag = False
            for m_line in merged:
                mx1, my1, mx2, my2 = m_line
                dist1 = np.sqrt((x1 - mx1) ** 2 + (y1 - my1) ** 2)
                dist2 = np.sqrt((x2 - mx2) ** 2 + (y2 - my2) ** 2)
                if dist1 < threshold and dist2 < threshold:
                    merged_flag = True
                    break
            if not merged_flag:
                merged.append(line)
        return merged

    def detect_sidelines(
        self, frame: np.ndarray
    ) -> List[Tuple[float, float, float, float]]:
        mask = self._create_green_mask(frame)
        edges = self._detect_edges(frame, mask)
        lines = self._hough_lines(edges)
        horizontal_lines = self._filter_lines_by_angle(lines, (0, 15))
        vertical_lines = self._filter_lines_by_angle(lines, (75, 105))
        sidelines = horizontal_lines + vertical_lines
        return self._merge(sidelines, threshold=50)

    def detect_penalty_area(
        self, frame: np.ndarray
    ) -> List[Tuple[float, float, float, float]]:
        mask = self._create_green_mask(frame)
        edges = self._detect_edges(frame, mask)
        lines = self._hough_lines(edges)
        horizontal_lines = self._filter_lines_by_angle(lines, (0, 15))
        vertical_lines = self._filter_lines_by_angle(lines, (75, 105))
        penalty_lines = []
        h, w = frame.shape[:2]
        for x1, y1, x2, y2 in horizontal_lines:
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if 0.15 * w <= length <= 0.35 * w:
                penalty_lines.append((x1, y1, x2, y2))
        for x1, y1, x2, y2 in vertical_lines:
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if 0.25 * h <= length <= 0.5 * h:
                penalty_lines.append((x1, y1, x2, y2))
        return self._merge(penalty_lines, threshold=30)

    def detect_center_circle(
        self, frame: np.ndarray
    ) -> List[Tuple[float, float, float, float]]:
        mask = self._create_green_mask(frame)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.bitwise_and(gray, gray, mask=mask)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, self.canny_threshold1, self.canny_threshold2)
        h, w = frame.shape[:2]
        circles = cv2.HoughCircles(
            edges,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=h // 4,
            param1=50,
            param2=30,
            minRadius=h // 10,
            maxRadius=h // 4,
        )
        if circles is None:
            return []
        result = []
        for circle in circles[0]:
            cx, cy, r = circle
            result.append((cx - r, cy, cx + r, cy))
            result.append((cx, cy - r, cx, cy + r))
        return result

    def detect_goal_area(
        self, frame: np.ndarray
    ) -> List[Tuple[float, float, float, float]]:
        mask = self._create_green_mask(frame)
        edges = self._detect_edges(frame, mask)
        lines = self._hough_lines(edges)
        horizontal_lines = self._filter_lines_by_angle(lines, (0, 15))
        vertical_lines = self._filter_lines_by_angle(lines, (75, 105))
        goal_lines = []
        h, w = frame.shape[:2]
        for x1, y1, x2, y2 in horizontal_lines:
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if 0.05 * w <= length <= 0.15 * w:
                goal_lines.append((x1, y1, x2, y2))
        for x1, y1, x2, y2 in vertical_lines:
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if 0.1 * h <= length <= 0.2 * h:
                goal_lines.append((x1, y1, x2, y2))
        return self._merge(goal_lines, threshold=20)
