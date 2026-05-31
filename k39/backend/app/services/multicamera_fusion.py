import numpy as np
import cv2
from typing import List, Dict, Optional, Tuple, Any
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.tracking_data import TrackingData
from app.utils.homography import HomographyTransformer
from app.services.pitch_analyzer import PitchAnalyzer


VALID_CAMERA_TYPES = ('main', 'goal_left', 'goal_right')

CAMERA_WEIGHTS = {
    'main': 1.0,
    'goal_left': 0.8,
    'goal_right': 0.8,
}


class MultiCameraFusion:
    """多摄像机融合服务，负责多路视频的标定、追踪数据融合与统一视角生成。"""

    def __init__(self, db: Optional[Session] = None, match_id: Optional[int] = None) -> None:
        """
        初始化多摄像机融合服务。

        Args:
            db: 数据库会话，可选。
            match_id: 比赛ID，可选。
        """
        self.db = db
        self.match_id = match_id
        self.cameras: Dict[str, Dict[str, Any]] = {}
        self.homographies: Dict[str, Optional[np.ndarray]] = {}
        self.pitch_analyzers: Dict[str, PitchAnalyzer] = {}

    def register_camera(
        self,
        camera_id: str,
        video_path: str,
        camera_type: str = 'main'
    ) -> Dict[str, Any]:
        """
        注册摄像机到融合服务。

        Args:
            camera_id: 摄像机唯一标识。
            video_path: 对应的视频文件路径。
            camera_type: 摄像机类型，支持 'main'(主机位)、'goal_left'(左球门后)、'goal_right'(右球门后)。

        Returns:
            包含注册信息的字典。

        Raises:
            ValueError: 当 camera_type 不在支持范围内时。
        """
        if camera_type not in VALID_CAMERA_TYPES:
            raise ValueError(
                f"Invalid camera_type '{camera_type}'. Must be one of {VALID_CAMERA_TYPES}"
            )

        self.cameras[camera_id] = {
            'camera_id': camera_id,
            'video_path': video_path,
            'camera_type': camera_type,
            'weight': CAMERA_WEIGHTS.get(camera_type, 1.0),
            'calibrated': False,
        }
        self.homographies[camera_id] = None
        self.pitch_analyzers[camera_id] = PitchAnalyzer()

        if self.db and self.match_id:
            self._save_camera_to_db(camera_id, video_path, camera_type)

        return {
            'camera_id': camera_id,
            'camera_type': camera_type,
            'video_path': video_path,
            'weight': CAMERA_WEIGHTS.get(camera_type, 1.0),
        }

    def calibrate_cameras(self, frame_number: int = 0) -> Dict[str, Any]:
        """
        标定所有已注册的摄像机，计算各自的单应性矩阵。

        Args:
            frame_number: 用于标定的帧号，默认为0（首帧）。

        Returns:
            各摄像机标定结果的字典，包含是否成功及单应性矩阵信息。
        """
        results: Dict[str, Any] = {}

        for camera_id, cam_info in self.cameras.items():
            video_path = cam_info['video_path']
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                results[camera_id] = {
                    'success': False,
                    'error': f"Cannot open video: {video_path}",
                }
                continue

            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            cap.release()

            if not ret or frame is None:
                results[camera_id] = {
                    'success': False,
                    'error': f"Cannot read frame {frame_number}",
                }
                continue

            analyzer = self.pitch_analyzers[camera_id]
            video_info = {
                'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                'fps': cap.get(cv2.CAP_PROP_FPS),
            }

            success = analyzer.calibrate(frame, video_info)

            if success:
                homo_matrix = analyzer.homography.matrix
                self.homographies[camera_id] = homo_matrix
                cam_info['calibrated'] = True
                results[camera_id] = {
                    'success': True,
                    'homography_shape': homo_matrix.shape if homo_matrix is not None else None,
                }
            else:
                results[camera_id] = {
                    'success': False,
                    'error': 'Calibration failed: insufficient line points',
                }

        return results

    def fuse_tracking_data(
        self,
        frame_data_list: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        融合来自多个摄像机的追踪数据，使用加权平均合并重叠区域。

        Args:
            frame_data_list: 来自各摄像机的帧数据列表，每项包含 camera_id、tracks 等字段。

        Returns:
            融合后的统一追踪数据，包含 tracks 和 fusion_info。
        """
        if not frame_data_list:
            return {'tracks': [], 'fusion_info': {'source_count': 0}}

        transformed_tracks: Dict[str, List[Dict[str, Any]]] = {}

        for frame_data in frame_data_list:
            camera_id = frame_data.get('camera_id')
            tracks = frame_data.get('tracks', [])

            if camera_id not in self.cameras:
                continue

            homo = self.homographies.get(camera_id)
            if homo is None:
                continue

            cam_weight = self.cameras[camera_id]['weight']
            cam_transformed = []

            for track in tracks:
                x, y = track.get('x', 0), track.get('y', 0)
                try:
                    tx, ty = self._transform_point(x, y, homo)
                except Exception:
                    continue

                cam_transformed.append({
                    'track_id': track.get('track_id'),
                    'x': tx,
                    'y': ty,
                    'confidence': track.get('confidence', 0.0),
                    'weight': cam_weight,
                    'camera_id': camera_id,
                    'team': track.get('team', 'unknown'),
                    'bbox': track.get('bbox'),
                })

            transformed_tracks[camera_id] = cam_transformed

        fused_tracks = self.resolve_id_conflicts(
            [tracks for tracks in transformed_tracks.values()]
        )

        overlap_info = self._compute_all_overlaps()

        return {
            'tracks': fused_tracks,
            'fusion_info': {
                'source_count': len(transformed_tracks),
                'cameras_used': list(transformed_tracks.keys()),
                'overlap_regions': overlap_info,
            },
        }

    def compute_overlap_region(
        self,
        cam1_homo: np.ndarray,
        cam2_homo: np.ndarray,
        image_size: Tuple[int, int] = (1080, 1920)
    ) -> Optional[Dict[str, Any]]:
        """
        计算两个摄像机视角的重叠区域。

        Args:
            cam1_homo: 摄像机1的单应性矩阵。
            cam2_homo: 摄像机2的单应性矩阵。
            image_size: 图像尺寸 (height, width)。

        Returns:
            重叠区域信息，包含多边形顶点和面积；无重叠时返回 None。
        """
        h, w = image_size
        corners = np.array([
            [0, 0], [w, 0], [w, h], [0, h]
        ], dtype=np.float32)

        cam1_pitch_corners = cv2.perspectiveTransform(
            corners.reshape(-1, 1, 2), cam1_homo
        ).reshape(-1, 2)

        cam2_pitch_corners = cv2.perspectiveTransform(
            corners.reshape(-1, 1, 2), cam2_homo
        ).reshape(-1, 2)

        polygon1 = self._order_points(cam1_pitch_corners)
        polygon2 = self._order_points(cam2_pitch_corners)

        intersection = self._polygon_intersection(polygon1, polygon2)

        if intersection is None or len(intersection) < 3:
            return None

        area = cv2.contourArea(intersection.astype(np.float32))

        return {
            'vertices': intersection.tolist(),
            'area': float(area),
            'num_vertices': len(intersection),
        }

    def resolve_id_conflicts(
        self,
        tracks_from_cams: List[List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        """
        解决跨摄像机追踪ID冲突，使用距离阈值匹配同一球员在不同摄像机中的轨迹。

        Args:
            tracks_from_cams: 各摄像机的追踪数据列表。

        Returns:
            解决冲突后的统一追踪数据列表。
        """
        if not tracks_from_cams:
            return []

        if len(tracks_from_cams) == 1:
            return tracks_from_cams[0]

        DISTANCE_THRESHOLD = 5.0

        merged: List[Dict[str, Any]] = []
        used_indices: set = set()

        primary_tracks = tracks_from_cams[0]
        secondary_tracks_list = tracks_from_cams[1:]

        for primary in primary_tracks:
            best_match: Optional[Dict[str, Any]] = None
            best_dist = DISTANCE_THRESHOLD
            best_cam_idx = -1
            best_track_idx = -1

            for cam_idx, sec_tracks in enumerate(secondary_tracks_list):
                for track_idx, sec_track in enumerate(sec_tracks):
                    key = (cam_idx + 1, track_idx)
                    if key in used_indices:
                        continue

                    dist = np.sqrt(
                        (primary['x'] - sec_track['x']) ** 2 +
                        (primary['y'] - sec_track['y']) ** 2
                    )

                    if dist < best_dist:
                        best_dist = dist
                        best_match = sec_track
                        best_cam_idx = cam_idx
                        best_track_idx = track_idx

            if best_match is not None:
                used_indices.add((best_cam_idx + 1, best_track_idx))
                w1 = primary.get('weight', 1.0)
                w2 = best_match.get('weight', 1.0)
                total_w = w1 + w2

                merged.append({
                    'track_id': primary.get('track_id'),
                    'x': (primary['x'] * w1 + best_match['x'] * w2) / total_w,
                    'y': (primary['y'] * w1 + best_match['y'] * w2) / total_w,
                    'confidence': max(
                        primary.get('confidence', 0.0),
                        best_match.get('confidence', 0.0)
                    ),
                    'team': primary.get('team', 'unknown'),
                    'source_cameras': [primary.get('camera_id'), best_match.get('camera_id')],
                    'bbox': primary.get('bbox'),
                })
            else:
                merged.append({
                    'track_id': primary.get('track_id'),
                    'x': primary['x'],
                    'y': primary['y'],
                    'confidence': primary.get('confidence', 0.0),
                    'team': primary.get('team', 'unknown'),
                    'source_cameras': [primary.get('camera_id')],
                    'bbox': primary.get('bbox'),
                })

        for cam_idx, sec_tracks in enumerate(secondary_tracks_list):
            for track_idx, sec_track in enumerate(sec_tracks):
                key = (cam_idx + 1, track_idx)
                if key not in used_indices:
                    merged.append({
                        'track_id': sec_track.get('track_id'),
                        'x': sec_track['x'],
                        'y': sec_track['y'],
                        'confidence': sec_track.get('confidence', 0.0),
                        'team': sec_track.get('team', 'unknown'),
                        'source_cameras': [sec_track.get('camera_id')],
                        'bbox': sec_track.get('bbox'),
                    })

        return merged

    def get_unified_view(self, frame_number: int) -> Dict[str, Any]:
        """
        获取指定帧号的统一视角，融合所有摄像机数据到球场坐标系。

        Args:
            frame_number: 帧号。

        Returns:
            统一视角数据，包含融合后的追踪信息和各摄像机状态。
        """
        frame_data_list: List[Dict[str, Any]] = []

        for camera_id, cam_info in self.cameras.items():
            if not cam_info['calibrated']:
                continue

            video_path = cam_info['video_path']
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                continue

            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            cap.release()

            if not ret:
                continue

            frame_data_list.append({
                'camera_id': camera_id,
                'tracks': [],
                'frame_available': True,
            })

        fusion_result = self.fuse_tracking_data(frame_data_list)

        return {
            'frame_number': frame_number,
            'tracks': fusion_result['tracks'],
            'fusion_info': fusion_result['fusion_info'],
            'cameras_status': {
                cam_id: {
                    'calibrated': info['calibrated'],
                    'type': info['camera_type'],
                }
                for cam_id, info in self.cameras.items()
            },
        }

    def _transform_point(
        self,
        x: float,
        y: float,
        homo: np.ndarray
    ) -> Tuple[float, float]:
        """
        使用单应性矩阵将图像坐标转换为球场坐标。

        Args:
            x: 图像x坐标。
            y: 图像y坐标。
            homo: 单应性矩阵。

        Returns:
            转换后的球场坐标 (tx, ty)。
        """
        point = np.array([[x, y]], dtype=np.float32).reshape(-1, 1, 2)
        transformed = cv2.perspectiveTransform(point, homo)
        return float(transformed[0][0][0]), float(transformed[0][0][1])

    def _compute_all_overlaps(self) -> Dict[str, Optional[Dict[str, Any]]]:
        """
        计算所有摄像机对之间的重叠区域。

        Returns:
            以 "cam1_cam2" 为键的重叠区域信息字典。
        """
        overlaps: Dict[str, Optional[Dict[str, Any]]] = {}
        camera_ids = list(self.cameras.keys())

        for i in range(len(camera_ids)):
            for j in range(i + 1, len(camera_ids)):
                cam1_id = camera_ids[i]
                cam2_id = camera_ids[j]

                h1 = self.homographies.get(cam1_id)
                h2 = self.homographies.get(cam2_id)

                if h1 is None or h2 is None:
                    overlaps[f"{cam1_id}_{cam2_id}"] = None
                    continue

                overlaps[f"{cam1_id}_{cam2_id}"] = self.compute_overlap_region(h1, h2)

        return overlaps

    @staticmethod
    def _order_points(pts: np.ndarray) -> np.ndarray:
        """
        按逆时针顺序排列多边形顶点。

        Args:
            pts: 顶点数组。

        Returns:
            排序后的顶点数组。
        """
        center = pts.mean(axis=0)
        angles = np.arctan2(pts[:, 1] - center[1], pts[:, 0] - center[0])
        order = np.argsort(angles)
        return pts[order]

    @staticmethod
    def _polygon_intersection(
        poly1: np.ndarray,
        poly2: np.ndarray
    ) -> Optional[np.ndarray]:
        """
        计算两个多边形的交集。

        Args:
            poly1: 第一个多边形的顶点。
            poly2: 第二个多边形的顶点。

        Returns:
            交集多边形的顶点数组，无交集时返回 None。
        """
        ret, intersection = cv2.intersectConvexConvex(
            poly1.astype(np.float32),
            poly2.astype(np.float32)
        )

        if ret <= 0 or intersection is None or len(intersection) < 3:
            return None

        return intersection.reshape(-1, 2)

    def _save_camera_to_db(
        self,
        camera_id: str,
        video_path: str,
        camera_type: str
    ) -> None:
        """
        将摄像机信息保存到数据库。

        Args:
            camera_id: 摄像机标识。
            video_path: 视频路径。
            camera_type: 摄像机类型。
        """
        from app.models.match import Camera

        db = self.db
        if db is None:
            db = SessionLocal()
        try:
            camera = Camera(
                match_id=self.match_id,
                camera_id=camera_id,
                video_path=video_path,
                name=camera_type,
            )
            db.add(camera)
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            if self.db is None:
                db.close()
