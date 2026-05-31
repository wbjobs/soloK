import numpy as np
import cv2
import json
from typing import List, Tuple, Optional, Dict
from app.utils.pitch_template import get_standard_pitch_points


class HomographyTransformer:
    def __init__(self):
        self.matrix: Optional[np.ndarray] = None
        self.inverse_matrix: Optional[np.ndarray] = None

    @staticmethod
    def get_standard_key_points() -> Dict[str, Tuple[float, float]]:
        return get_standard_pitch_points()

    def compute_matrix(
        self, src_points: List[Tuple[float, float]], dst_points: List[Tuple[float, float]]
    ) -> np.ndarray:
        if len(src_points) < 4 or len(dst_points) < 4:
            raise ValueError("At least 4 corresponding points are required")
        if len(src_points) != len(dst_points):
            raise ValueError("Source and destination points must have the same length")

        src = np.array(src_points, dtype=np.float32)
        dst = np.array(dst_points, dtype=np.float32)

        self.matrix, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if self.matrix is not None:
            self.inverse_matrix = np.linalg.inv(self.matrix)
        return self.matrix

    def transform_point(self, x: float, y: float) -> Tuple[float, float]:
        if self.matrix is None:
            raise ValueError("Homography matrix not computed. Call compute_matrix first.")
        point = np.array([[x, y]], dtype=np.float32).reshape(-1, 1, 2)
        transformed = cv2.perspectiveTransform(point, self.matrix)
        return float(transformed[0][0][0]), float(transformed[0][0][1])

    def transform_points(
        self, points: List[Tuple[float, float]]
    ) -> List[Tuple[float, float]]:
        if self.matrix is None:
            raise ValueError("Homography matrix not computed. Call compute_matrix first.")
        pts = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
        transformed = cv2.perspectiveTransform(pts, self.matrix)
        return [(float(p[0][0]), float(p[0][1])) for p in transformed]

    def inverse_transform(self, x: float, y: float) -> Tuple[float, float]:
        if self.inverse_matrix is None:
            raise ValueError("Homography matrix not computed. Call compute_matrix first.")
        point = np.array([[x, y]], dtype=np.float32).reshape(-1, 1, 2)
        transformed = cv2.perspectiveTransform(point, self.inverse_matrix)
        return float(transformed[0][0][0]), float(transformed[0][0][1])

    def inverse_transform_points(
        self, points: List[Tuple[float, float]]
    ) -> List[Tuple[float, float]]:
        if self.inverse_matrix is None:
            raise ValueError("Homography matrix not computed. Call compute_matrix first.")
        pts = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
        transformed = cv2.perspectiveTransform(pts, self.inverse_matrix)
        return [(float(p[0][0]), float(p[0][1])) for p in transformed]

    def save_matrix(self, file_path: str) -> None:
        if self.matrix is None:
            raise ValueError("Homography matrix not computed. Call compute_matrix first.")
        data = {
            "matrix": self.matrix.tolist(),
            "inverse_matrix": self.inverse_matrix.tolist() if self.inverse_matrix is not None else None,
        }
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)

    def load_matrix(self, file_path: str) -> None:
        with open(file_path, "r") as f:
            data = json.load(f)
        self.matrix = np.array(data["matrix"], dtype=np.float32)
        if data.get("inverse_matrix") is not None:
            self.inverse_matrix = np.array(data["inverse_matrix"], dtype=np.float32)
        else:
            self.inverse_matrix = np.linalg.inv(self.matrix)

    def is_calibrated(self) -> bool:
        return self.matrix is not None
