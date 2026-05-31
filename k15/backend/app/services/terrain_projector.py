import numpy as np
import math
import cv2
from typing import Tuple, Optional, Dict, List
from dataclasses import dataclass
from app.core.logging import logger


@dataclass
class ProjectionResult:
    target_id: int
    class_name: str
    confidence: float
    original_bbox: Tuple[int, int, int, int]
    projected_3d_center: Tuple[float, float, float]
    projected_3d_corners: List[Tuple[float, float, float]]
    depth_at_center: float
    terrain_slope: float
    surface_area: float
    height_above_seabed: float


class TerrainProjector:
    def __init__(self):
        self.max_projection_distance = 500.0

    def project_detections_to_3d(
        self,
        detections: List[Dict],
        sidescan_data,
        multibeam_data,
        sidescan_image_shape: Tuple[int, int],
    ) -> List[ProjectionResult]:
        if not detections or not multibeam_data or not multibeam_data.pings:
            return []

        results = []

        ping_duration = 1.0
        if sidescan_data and sidescan_data.pings:
            if len(sidescan_data.pings) > 1:
                ping_duration = sidescan_data.pings[1].timestamp - sidescan_data.pings[0].timestamp

        img_h, img_w = sidescan_image_shape

        for idx, det in enumerate(detections):
            if isinstance(det, dict):
                bbox = det.get("bbox", (0, 0, 0, 0))
                class_name = det.get("class_name", "unknown")
                confidence = det.get("confidence", 0)
            elif hasattr(det, 'bbox'):
                bbox = det.bbox
                class_name = det.class_name
                confidence = det.confidence
            else:
                continue

            if isinstance(bbox, dict):
                x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("width", 0), bbox.get("height", 0)
            else:
                x, y, w, h = bbox

            center_x = x + w / 2
            center_y = y + h / 2

            total_pings = len(sidescan_data.pings) if sidescan_data and sidescan_data.pings else img_h
            ping_index = int((center_y / img_h) * total_pings)
            ping_index = max(0, min(ping_index, total_pings - 1))

            beam_angle = -60.0 + (center_x / img_w) * 120.0

            ping = self._find_closest_multibeam_ping(
                multibeam_data,
                ping_index,
                ping_duration,
                sidescan_data,
            )

            if ping is None:
                continue

            depth_at_center = self._interpolate_depth(
                ping,
                beam_angle,
            )

            center_3d = self._beam_to_xyz(
                ping,
                beam_angle,
                depth_at_center,
            )

            corners_3d = []
            for corner in [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]:
                cx_ping = int((corner[1] / img_h) * total_pings)
                cx_angle = -60.0 + (corner[0] / img_w) * 120.0

                cx_ping = max(0, min(cx_ping, len(multibeam_data.pings) - 1))
                cx_beam = self._find_closest_multibeam_ping(
                    multibeam_data,
                    cx_ping,
                    ping_duration,
                    sidescan_data,
                )

                if cx_beam:
                    cx_depth = self._interpolate_depth(cx_beam, cx_angle)
                    cx_xyz = self._beam_to_xyz(cx_beam, cx_angle, cx_depth)
                    corners_3d.append(cx_xyz)

            if len(corners_3d) < 4:
                continue

            slope = self._calculate_terrain_slope(ping, beam_angle)
            surface_area = self._calculate_surface_area(corners_3d)
            height_above = self._calculate_height_above_seabed(
                ping, center_3d, beam_angle
            )

            result = ProjectionResult(
                target_id=idx,
                class_name=class_name,
                confidence=confidence,
                original_bbox=(x, y, w, h),
                projected_3d_center=center_3d,
                projected_3d_corners=corners_3d,
                depth_at_center=depth_at_center,
                terrain_slope=slope,
                surface_area=surface_area,
                height_above_seabed=height_above,
            )
            results.append(result)

        return results

    def _find_closest_multibeam_ping(
        self,
        multibeam_data,
        target_index: int,
        ping_duration: float,
        sidescan_data=None,
    ) -> Optional:
        if not multibeam_data or not multibeam_data.pings:
            return None

        target_time = target_index * ping_duration

        closest_ping = None
        min_time_diff = float('inf')

        for ping in multibeam_data.pings:
            time_diff = abs(ping.timestamp - target_time)
            if time_diff < min_time_diff:
                min_time_diff = time_diff
                closest_ping = ping

        if closest_ping and min_time_diff < self.max_projection_distance:
            return closest_ping

        if 0 <= target_index < len(multibeam_data.pings):
            return multibeam_data.pings[target_index]

        return multibeam_data.pings[min(target_index, len(multibeam_data.pings) - 1)]

    def _interpolate_depth(
        self,
        ping,
        target_angle: float,
    ) -> float:
        if not ping or len(ping.across_track_angles) == 0:
            return 0.0

        angles = ping.across_track_angles
        depths = ping.depths

        if target_angle <= angles[0]:
            return float(depths[0])
        if target_angle >= angles[-1]:
            return float(depths[-1])

        for i in range(len(angles) - 1):
            if angles[i] <= target_angle <= angles[i + 1]:
                t = (target_angle - angles[i]) / (angles[i + 1] - angles[i])
                return float(depths[i] + t * (depths[i + 1] - depths[i]))

        return float(depths[-1])

    def _beam_to_xyz(
        self,
        ping,
        beam_angle: float,
        depth: float,
    ) -> Tuple[float, float, float]:
        angle_rad = math.radians(beam_angle)

        y = depth * math.sin(angle_rad)
        z = -depth * math.cos(angle_rad)
        x = ping.along_track_distance if hasattr(ping, 'along_track_distance') else 0

        return (x, y, z)

    def _calculate_terrain_slope(
        self,
        ping,
        center_angle: float,
        window_size: int = 5,
    ) -> float:
        if not ping or len(ping.across_track_angles) < window_size * 2:
            return 0.0

        center_idx = np.argmin(np.abs(ping.across_track_angles - center_angle))
        start_idx = max(0, center_idx - window_size)
        end_idx = min(len(ping.across_track_angles), center_idx + window_size + 1)

        angles = ping.across_track_angles[start_idx:end_idx]
        depths = ping.depths[start_idx:end_idx]

        if len(angles) < 3:
            return 0.0

        try:
            coeffs = np.polyfit(angles, depths, 2)
            slope_at_center = 2 * coeffs[0] * center_angle + coeffs[1]
            return float(math.degrees(math.atan(slope_at_center)))
        except Exception:
            return 0.0

    def _calculate_surface_area(
        self,
        corners_3d: List[Tuple[float, float, float]],
    ) -> float:
        if len(corners_3d) < 4:
            return 0.0

        area = 0.0
        for i in range(len(corners_3d)):
            j = (i + 1) % len(corners_3d)
            k = (i + 2) % len(corners_3d)

            v1 = np.array(corners_3d[j]) - np.array(corners_3d[i])
            v2 = np.array(corners_3d[k]) - np.array(corners_3d[i])

            area += np.linalg.norm(np.cross(v1, v2)) / 2

        return float(area)

    def _calculate_height_above_seabed(
        self,
        ping,
        center_3d: Tuple[float, float, float],
        beam_angle: float,
    ) -> float:
        if not ping:
            return 0.0

        seabed_z = center_3d[2]

        nearby_indices = np.abs(ping.across_track_angles - beam_angle) < 5.0
        if nearby_indices.any():
            seabed_z = np.min(ping.depths[nearby_indices]) * -1

        return float(center_3d[2] - seabed_z)

    def generate_3d_scene_data(
        self,
        multibeam_data,
        projection_results: List[ProjectionResult],
        grid_size: int = 200,
    ) -> Dict:
        if not multibeam_data or not multibeam_data.pings:
            return {"vertices": [], "faces": [], "targets": []}

        all_points = []
        for ping in multibeam_data.pings[:200]:
            for depth, angle_deg in zip(ping.depths, ping.across_track_angles):
                angle_rad = math.radians(angle_deg)
                y = depth * math.sin(angle_rad)
                z = -depth * math.cos(angle_rad)
                x = ping.along_track_distance
                all_points.append([x, y, z])

        if not all_points:
            return {"vertices": [], "faces": [], "targets": []}

        points = np.array(all_points)

        grid_x = np.linspace(points[:, 0].min(), points[:, 0].max(), grid_size)
        grid_y = np.linspace(points[:, 1].min(), points[:, 1].max(), grid_size)

        grid_z = np.full((grid_size, grid_size), np.nan)

        from scipy.interpolate import griddata
        try:
            grid_z = griddata(
                points[:, :2],
                points[:, 2],
                (grid_x[None, :], grid_y[:, None]),
                method='linear',
            )
        except Exception:
            pass

        vertices = []
        faces = []

        for i in range(grid_size):
            for j in range(grid_size):
                if not np.isnan(grid_z[i, j]):
                    vertices.append([
                        float(grid_x[j]),
                        float(grid_y[i]),
                        float(grid_z[i, j]),
                    ])

        for i in range(grid_size - 1):
            for j in range(grid_size - 1):
                v0 = i * grid_size + j
                v1 = v0 + 1
                v2 = (i + 1) * grid_size + j
                v3 = v2 + 1

                if all(v < len(vertices) for v in [v0, v1, v2, v3]):
                    faces.append([v0, v1, v2])
                    faces.append([v1, v3, v2])

        targets = []
        for result in projection_results:
            targets.append({
                "id": result.target_id,
                "class_name": result.class_name,
                "confidence": result.confidence,
                "center": list(result.projected_3d_center),
                "corners": [list(c) for c in result.projected_3d_corners],
                "depth": result.depth_at_center,
                "slope": result.terrain_slope,
                "area": result.surface_area,
                "height_above": result.height_above_seabed,
            })

        return {
            "vertices": vertices,
            "faces": faces,
            "targets": targets,
            "grid_size": grid_size,
        }


terrain_projector = TerrainProjector()
