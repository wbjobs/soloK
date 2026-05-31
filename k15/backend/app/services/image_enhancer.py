import cv2
import numpy as np
from typing import Dict, Tuple, Optional
from app.core.logging import logger


class ImageEnhancer:
    def __init__(self):
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    def enhance(
        self,
        image: np.ndarray,
        apply_equalization: bool = True,
        apply_median_filter: bool = True,
        median_kernel_size: int = 3,
        clahe_clip_limit: float = 2.0,
        clahe_tile_grid: int = 8,
    ) -> Dict:
        result = image.copy()
        operations = []

        if len(result.shape) == 3:
            gray = cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
        else:
            gray = result

        gray = gray.astype(np.uint8)

        if apply_median_filter:
            ksize = max(1, median_kernel_size)
            if ksize % 2 == 0:
                ksize += 1
            gray = cv2.medianBlur(gray, ksize)
            operations.append(f"median_filter(kernel={ksize})")

        if apply_equalization:
            clahe = cv2.createCLAHE(
                clipLimit=clahe_clip_limit,
                tileGridSize=(clahe_tile_grid, clahe_tile_grid),
            )
            gray = clahe.apply(gray)
            operations.append(f"clahe(clip={clahe_clip_limit}, tiles={clahe_tile_grid})")

        result = gray
        return {
            "image": result,
            "operations": operations,
        }

    def histogram_equalization(self, image: np.ndarray) -> np.ndarray:
        if len(image.shape) == 3:
            ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
            ycrcb[:, :, 0] = cv2.equalizeHist(ycrcb[:, :, 0])
            return cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)
        else:
            return cv2.equalizeHist(image.astype(np.uint8))

    def clahe_enhance(
        self,
        image: np.ndarray,
        clip_limit: float = 2.0,
        tile_grid_size: int = 8,
    ) -> np.ndarray:
        clahe = cv2.createCLAHE(
            clipLimit=clip_limit,
            tileGridSize=(tile_grid_size, tile_grid_size),
        )
        if len(image.shape) == 3:
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            lab[:, :, 0] = clahe.apply(lab[:, :, 0])
            return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        else:
            return clahe.apply(image.astype(np.uint8))

    def median_filter(self, image: np.ndarray, kernel_size: int = 3) -> np.ndarray:
        ksize = max(1, kernel_size)
        if ksize % 2 == 0:
            ksize += 1
        return cv2.medianBlur(image, ksize)

    def gaussian_filter(self, image: np.ndarray, kernel_size: int = 5) -> np.ndarray:
        ksize = max(1, kernel_size)
        if ksize % 2 == 0:
            ksize += 1
        return cv2.GaussianBlur(image, (ksize, ksize), 0)

    def bilateral_filter(
        self,
        image: np.ndarray,
        d: int = 9,
        sigma_color: float = 75.0,
        sigma_space: float = 75.0,
    ) -> np.ndarray:
        return cv2.bilateralFilter(image, d, sigma_color, sigma_space)

    def despeckle(self, image: np.ndarray, iterations: int = 2) -> np.ndarray:
        result = image.astype(np.uint8).copy()
        for _ in range(iterations):
            result = cv2.medianBlur(result, 3)
            result = cv2.GaussianBlur(result, (3, 3), 0)
        return result

    def adaptive_equalization(self, image: np.ndarray, clip_limit: float = 3.0) -> np.ndarray:
        if len(image.shape) == 3:
            img_yuv = cv2.cvtColor(image, cv2.COLOR_BGR2YUV)
            clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
            img_yuv[:, :, 0] = clahe.apply(img_yuv[:, :, 0])
            return cv2.cvtColor(img_yuv, cv2.COLOR_YUV2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
            return clahe.apply(image.astype(np.uint8))

    def compute_statistics(self, image: np.ndarray) -> Dict:
        gray = image
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = gray.astype(np.float64)

        hist = cv2.calcHist([gray.astype(np.uint8)], [0], None, [256], [0, 256])
        hist = hist.flatten()
        hist = hist / hist.sum()

        cdf = np.cumsum(hist)

        entropy = -np.sum(hist[hist > 0] * np.log2(hist[hist > 0]))

        return {
            "mean": float(np.mean(gray)),
            "std": float(np.std(gray)),
            "min": float(np.min(gray)),
            "max": float(np.max(gray)),
            "median": float(np.median(gray)),
            "entropy": float(entropy),
            "histogram": hist.tolist(),
            "cdf": cdf.tolist(),
        }

    def denoise_wavelet(self, image: np.ndarray, level: int = 2) -> np.ndarray:
        gray = image.astype(np.float64)

        for _ in range(level):
            h, w = gray.shape
            h_half, w_half = h // 2, w // 2

            LL = gray[:h_half, :w_half]
            LH = gray[:h_half, w_half:]
            HL = gray[h_half:, :w_half]
            HH = gray[h_half:, w_half:]

            threshold = np.std(HH) * 0.7
            LH[np.abs(LH) < threshold] = 0
            HL[np.abs(HL) < threshold] = 0
            HH[np.abs(HH) < threshold] = 0

            result = np.zeros_like(gray)
            result[:h_half, :w_half] = LL
            result[:h_half, w_half:] = LH
            result[h_half:, :w_half] = HL
            result[h_half:, w_half:] = HH
            gray = result

        return np.clip(gray, 0, 255).astype(np.uint8)


image_enhancer = ImageEnhancer()
