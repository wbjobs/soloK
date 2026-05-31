import numpy as np
import cv2
from typing import Tuple, Optional, Dict, List
from dataclasses import dataclass, asdict
from app.core.logging import logger


@dataclass
class AcousticFeatures:
    target_id: str
    class_name: str
    echo_intensity_mean: float
    echo_intensity_std: float
    echo_intensity_max: float
    echo_intensity_min: float
    shadow_length: float
    shadow_ratio: float
    contrast: float
    homogeneity: float
    energy: float
    entropy: float
    correlation: float
    lbp_histogram: List[float]
    hu_moments: List[float]
    area_ratio: float
    aspect_ratio: float
    perimeter: float
    circularity: float

    def to_dict(self) -> Dict:
        return asdict(self)

    def to_feature_vector(self) -> np.ndarray:
        features = [
            self.echo_intensity_mean,
            self.echo_intensity_std,
            self.echo_intensity_max,
            self.echo_intensity_min,
            self.shadow_length,
            self.shadow_ratio,
            self.contrast,
            self.homogeneity,
            self.energy,
            self.entropy,
            self.correlation,
            *self.lbp_histogram,
            *self.hu_moments,
            self.area_ratio,
            self.aspect_ratio,
            self.perimeter,
            self.circularity,
        ]
        return np.array(features, dtype=np.float32)


class AcousticFeatureExtractor:
    def __init__(self):
        self.lbp_neighbors = 8
        self.lbp_radius = 1
        self.num_glcm_levels = 256

    def extract_features(
        self,
        image: np.ndarray,
        bbox: Tuple[int, int, int, int],
        class_name: str,
        target_id: str = "",
    ) -> Optional[AcousticFeatures]:
        try:
            x, y, w, h = bbox
            x1 = max(0, x)
            y1 = max(0, y)
            x2 = min(image.shape[1], x + w)
            y2 = min(image.shape[0], y + h)

            if x2 <= x1 or y2 <= y1:
                return None

            roi = image[y1:y2, x1:x2]

            if len(roi.shape) == 3:
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            else:
                gray = roi.copy()

            if gray.size == 0:
                return None

            intensity_features = self._extract_intensity_features(gray)
            shadow_features = self._extract_shadow_features(gray)
            glcm_features = self._extract_glcm_features(gray)
            lbp_hist = self._extract_lbp_features(gray)
            shape_features = self._extract_shape_features(gray, w, h)
            hu_moments = self._extract_hu_moments(gray)

            return AcousticFeatures(
                target_id=target_id,
                class_name=class_name,
                echo_intensity_mean=intensity_features["mean"],
                echo_intensity_std=intensity_features["std"],
                echo_intensity_max=intensity_features["max"],
                echo_intensity_min=intensity_features["min"],
                shadow_length=shadow_features["shadow_length"],
                shadow_ratio=shadow_features["shadow_ratio"],
                contrast=glcm_features["contrast"],
                homogeneity=glcm_features["homogeneity"],
                energy=glcm_features["energy"],
                entropy=glcm_features["entropy"],
                correlation=glcm_features["correlation"],
                lbp_histogram=lbp_hist,
                hu_moments=hu_moments,
                area_ratio=shape_features["area_ratio"],
                aspect_ratio=shape_features["aspect_ratio"],
                perimeter=shape_features["perimeter"],
                circularity=shape_features["circularity"],
            )

        except Exception as e:
            logger.error(f"Feature extraction error: {e}")
            return None

    def _extract_intensity_features(self, gray: np.ndarray) -> Dict:
        return {
            "mean": float(np.mean(gray)),
            "std": float(np.std(gray)),
            "max": float(np.max(gray)),
            "min": float(np.min(gray)),
        }

    def _extract_shadow_features(self, gray: np.ndarray) -> Dict:
        try:
            _, binary = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY_INV)

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

            contours, _ = cv2.findContours(
                binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            if contours:
                largest_contour = max(contours, key=cv2.contourArea)
                shadow_area = cv2.contourArea(largest_contour)
                x, y, w, h = cv2.boundingRect(largest_contour)
                shadow_length = max(w, h)
            else:
                shadow_area = 0
                shadow_length = 0

            total_area = gray.shape[0] * gray.shape[1]
            shadow_ratio = shadow_area / max(total_area, 1)

            return {
                "shadow_length": float(shadow_length),
                "shadow_ratio": float(shadow_ratio),
            }

        except Exception:
            return {"shadow_length": 0.0, "shadow_ratio": 0.0}

    def _extract_glcm_features(self, gray: np.ndarray) -> Dict:
        try:
            from skimage.feature import graycomatrix, graycoprops

            glcm = graycomatrix(
                gray,
                distances=[1, 3, 5],
                angles=[0, np.pi / 4, np.pi / 2, 3 * np.pi / 4],
                levels=256,
                symmetric=True,
                normed=True,
            )

            contrast = float(np.mean(graycoprops(glcm, "contrast")))
            homogeneity = float(np.mean(graycoprops(glcm, "homogeneity")))
            energy = float(np.mean(graycoprops(glcm, "energy")))
            correlation = float(np.mean(graycoprops(glcm, "correlation")))

            entropy = self._calculate_entropy(glcm)

            return {
                "contrast": contrast,
                "homogeneity": homogeneity,
                "energy": energy,
                "entropy": entropy,
                "correlation": correlation,
            }

        except ImportError:
            return self._extract_glcm_features_simple(gray)

    def _extract_glcm_features_simple(self, gray: np.ndarray) -> Dict:
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        hist = hist.flatten() / hist.sum()

        contrast = float(np.sum(hist * np.arange(256) ** 2))
        homogeneity = float(np.sum(hist / (1 + np.arange(256))))
        energy = float(np.sum(hist ** 2))
        entropy = float(-np.sum(hist * np.log2(hist + 1e-10)))
        correlation = float(np.corrcoef(np.arange(256), hist)[0, 1])

        return {
            "contrast": contrast,
            "homogeneity": homogeneity,
            "energy": energy,
            "entropy": entropy,
            "correlation": correlation if not np.isnan(correlation) else 0.0,
        }

    def _calculate_entropy(self, glcm: np.ndarray) -> float:
        eps = 1e-10
        return float(-np.sum(glcm * np.log(glcm + eps)))

    def _extract_lbp_features(self, gray: np.ndarray) -> List[float]:
        try:
            lbp_image = np.zeros_like(gray)

            for i in range(1, gray.shape[0] - 1):
                for j in range(1, gray.shape[1] - 1):
                    center = gray[i, j]
                    code = 0
                    code |= (gray[i - 1, j - 1] >= center) << 7
                    code |= (gray[i - 1, j] >= center) << 6
                    code |= (gray[i - 1, j + 1] >= center) << 5
                    code |= (gray[i, j + 1] >= center) << 4
                    code |= (gray[i + 1, j + 1] >= center) << 3
                    code |= (gray[i + 1, j] >= center) << 2
                    code |= (gray[i + 1, j - 1] >= center) << 1
                    code |= (gray[i, j - 1] >= center) << 0
                    lbp_image[i, j] = code

            hist = cv2.calcHist([lbp_image], [0], None, [256], [0, 256])
            hist = hist.flatten() / hist.sum()
            return hist.tolist()

        except Exception:
            return [0.0] * 256

    def _extract_hu_moments(self, gray: np.ndarray) -> List[float]:
        try:
            moments = cv2.moments(gray)
            hu_moments = cv2.HuMoments(moments).flatten()
            return hu_moments.tolist()
        except Exception:
            return [0.0] * 7

    def _extract_shape_features(
        self, gray: np.ndarray, width: int, height: int
    ) -> Dict:
        try:
            _, binary = cv2.threshold(gray, 50, 255, cv2.THRESH_BINARY)

            contours, _ = cv2.findContours(
                binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            if contours:
                largest = max(contours, key=cv2.contourArea)
                area = cv2.contourArea(largest)
                perimeter = cv2.arcLength(largest, True)
                circularity = 4 * np.pi * area / (perimeter ** 2) if perimeter > 0 else 0
            else:
                area = 0
                perimeter = 0
                circularity = 0

            total_area = width * height
            aspect_ratio = width / max(height, 1)
            area_ratio = area / max(total_area, 1)

            return {
                "area_ratio": float(area_ratio),
                "aspect_ratio": float(aspect_ratio),
                "perimeter": float(perimeter),
                "circularity": float(circularity),
            }

        except Exception:
            return {
                "area_ratio": 0.0,
                "aspect_ratio": 0.0,
                "perimeter": 0.0,
                "circularity": 0.0,
            }


feature_extractor = AcousticFeatureExtractor()
