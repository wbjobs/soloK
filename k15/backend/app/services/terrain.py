import numpy as np
import cv2
import os
import tempfile
from typing import List, Dict, Tuple, Optional
from app.core.logging import logger

try:
    import rasterio
    from rasterio.transform import from_bounds
    from rasterio.crs import CRS
    RASTERIO_AVAILABLE = True
except ImportError:
    RASTERIO_AVAILABLE = False
    logger.warning("Rasterio not available. GeoTIFF export will be limited.")


class TerrainStitcher:
    def __init__(self):
        self.sift = cv2.SIFT_create()
        self.matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

    def stitch_multiple_lines(
        self,
        image_list: List[np.ndarray],
        positions: Optional[List[Tuple[float, float]]] = None,
        overlap_percent: float = 0.3,
    ) -> Dict:
        if not image_list:
            return {"success": False, "error": "No images provided"}

        if len(image_list) == 1:
            return {
                "success": True,
                "stitched_image": image_list[0],
                "overlap_info": {"total_images": 1, "stitched_images": 1},
            }

        stitched = image_list[0].astype(np.float32)
        stitched_count = 1

        for i in range(1, len(image_list)):
            result = self._stitch_pair(
                stitched.astype(np.uint8),
                image_list[i],
                overlap_percent,
            )
            if result.get("success"):
                stitched = result["stitched_image"].astype(np.float32)
                stitched_count += 1
            else:
                logger.warning(f"Failed to stitch image {i}: {result.get('error')}")

        stitched = np.clip(stitched, 0, 255).astype(np.uint8)

        return {
            "success": True,
            "stitched_image": stitched,
            "overlap_info": {
                "total_images": len(image_list),
                "stitched_images": stitched_count,
            },
        }

    def _stitch_pair(
        self,
        img1: np.ndarray,
        img2: np.ndarray,
        overlap_percent: float,
    ) -> Dict:
        try:
            if len(img1.shape) == 3:
                img1_gray = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
            else:
                img1_gray = img1

            if len(img2.shape) == 3:
                img2_gray = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
            else:
                img2_gray = img2

            h1, w1 = img1_gray.shape
            h2, w2 = img2_gray.shape

            overlap_width = int(min(w1, w2) * overlap_percent)
            region1 = img1_gray[:, -overlap_width:] if overlap_width < w1 else img1_gray
            region2 = img2_gray[:, :overlap_width] if overlap_width < w2 else img2_gray

            kp1, desc1 = self.sift.detectAndCompute(region1, None)
            kp2, desc2 = self.sift.detectAndCompute(region2, None)

            if desc1 is None or desc2 is None or len(kp1) < 4 or len(kp2) < 4:
                return self._simple_stitch(img1, img2, overlap_percent)

            matches = self.matcher.knnMatch(desc1, desc2, k=2)
            good_matches = []
            for m, n in matches:
                if m.distance < 0.7 * n.distance:
                    good_matches.append(m)

            if len(good_matches) < 4:
                return self._simple_stitch(img1, img2, overlap_percent)

            pts1 = np.float32([kp1[m.queryIdx].pt for m in good_matches])
            pts2 = np.float32([kp2[m.trainIdx].pt for m in good_matches])

            pts1[:, 0] += w1 - overlap_width
            pts2[:, 0] += 0

            H, mask = cv2.findHomography(pts2, pts1, cv2.RANSAC, 5.0)

            if H is None:
                return self._simple_stitch(img1, img2, overlap_percent)

            new_width = w1 + w2 - overlap_width
            new_height = max(h1, h2)

            warped = cv2.warpPerspective(
                img2, H, (new_width, new_height),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_CONSTANT,
            )

            result = warped.copy()
            result[:h1, :w1] = img1

            return {
                "success": True,
                "stitched_image": result,
                "homography": H.tolist(),
                "inliers": int(mask.sum()) if mask is not None else 0,
                "num_matches": len(good_matches),
            }

        except Exception as e:
            logger.error(f"Stitching error: {e}")
            return {"success": False, "error": str(e)}

    def _simple_stitch(
        self, img1: np.ndarray, img2: np.ndarray, overlap_percent: float
    ) -> Dict:
        h1, w1 = img1.shape[:2]
        h2, w2 = img2.shape[:2]

        overlap_width = int(min(w1, w2) * overlap_percent)
        new_width = w1 + w2 - overlap_width
        new_height = max(h1, h2)

        result = np.zeros((new_height, new_width, *img1.shape[2:]), dtype=img1.dtype)
        result[:h1, :w1] = img1
        result[:h2, w1 - overlap_width:] = img2

        return {
            "success": True,
            "stitched_image": result,
            "method": "simple",
        }

    def overlay_detections(
        self,
        terrain_image: np.ndarray,
        detections: List[Dict],
        color_map: Optional[Dict] = None,
    ) -> np.ndarray:
        if color_map is None:
            color_map = {
                "shipwreck": (0, 0, 255),
                "pipeline": (0, 255, 0),
                "reef": (255, 255, 0),
                "fish_school": (0, 255, 255),
            }

        result = terrain_image.copy()
        if len(result.shape) == 2:
            result = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)

        for det in detections:
            class_name = det.get("class_name", "unknown")
            bbox = det.get("bbox", {})
            if isinstance(bbox, dict):
                x = int(bbox.get("x", 0))
                y = int(bbox.get("y", 0))
                w = int(bbox.get("width", 0))
                h = int(bbox.get("height", 0))
            elif isinstance(bbox, (tuple, list)) and len(bbox) >= 4:
                x, y, w, h = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
            else:
                continue

            color = color_map.get(class_name, (255, 0, 0))
            cv2.rectangle(result, (x, y), (x + w, y + h), color, 3)

            label = f"{class_name} ({det.get('confidence', 0):.2f})"
            cv2.putText(
                result, label, (x, y - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2, cv2.LINE_AA,
            )

        return result

    def export_geotiff(
        self,
        image: np.ndarray,
        output_path: str,
        bounds: Tuple[float, float, float, float],
        crs_epsg: int = 4326,
    ) -> bool:
        if not RASTERIO_AVAILABLE:
            logger.error("Rasterio not available for GeoTIFF export")
            return False

        try:
            if len(image.shape) == 2:
                count = 1
                data = image
            else:
                count = image.shape[2]
                data = image.transpose(2, 0, 1)

            transform = from_bounds(*bounds, image.shape[1], image.shape[0])

            with rasterio.open(
                output_path,
                "w",
                driver="GTiff",
                height=image.shape[0],
                width=image.shape[1],
                count=count,
                dtype=data.dtype,
                crs=CRS.from_epsg(crs_epsg),
                transform=transform,
            ) as dst:
                if count == 1:
                    dst.write(data, 1)
                else:
                    for i in range(count):
                        dst.write(data[i], i + 1)

            logger.info(f"Exported GeoTIFF: {output_path}")
            return True

        except Exception as e:
            logger.error(f"GeoTIFF export error: {e}")
            return False

    def create_colored_terrain(
        self,
        grayscale_image: np.ndarray,
        colormap: int = cv2.COLORMAP_JET,
    ) -> np.ndarray:
        return cv2.applyColorMap(grayscale_image, colormap)

    def generate_heightmap_from_sonar(
        self,
        sonar_data,
        max_pings: int = 500,
    ) -> np.ndarray:
        if not sonar_data or not sonar_data.pings:
            return np.zeros((max_pings, sonar_data.num_samples // 2 if sonar_data else 100), dtype=np.uint8)

        pings = sonar_data.pings[:max_pings]
        num_samples = sonar_data.num_samples // 2

        heightmap = np.zeros((len(pings), num_samples), dtype=np.float32)

        for i, ping in enumerate(pings):
            port = ping.port_data[:num_samples] if len(ping.port_data) >= num_samples else np.zeros(num_samples)
            starboard = ping.starboard_data[:num_samples] if len(ping.starboard_data) >= num_samples else np.zeros(num_samples)

            combined = (port + starboard) / 2.0
            combined = np.convolve(combined, np.ones(5) / 5, mode="same")

            if combined.max() > 0:
                combined = (combined - combined.min()) / (combined.max() - combined.min())

            heightmap[i] = combined

        heightmap = np.clip(heightmap * 255, 0, 255).astype(np.uint8)
        return heightmap


terrain_stitcher = TerrainStitcher()
