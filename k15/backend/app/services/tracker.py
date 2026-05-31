import numpy as np
import cv2
from typing import List, Dict, Tuple, Optional
from collections import defaultdict, deque
from dataclasses import dataclass, field
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist
from app.core.logging import logger

try:
    from filterpy.kalman import KalmanFilter
    FILTERPY_AVAILABLE = True
except ImportError:
    FILTERPY_AVAILABLE = False
    logger.warning("FilterPy not installed. Using simple tracker.")


TRACK_STATE_ACTIVE = "active"
TRACK_STATE_LOST = "lost"
TRACK_STATE_DELETED = "deleted"


@dataclass
class TrackFeature:
    mean_color: np.ndarray
    histogram: np.ndarray
    aspect_ratio: float
    area_ratio: float
    class_name: str

    def to_array(self) -> np.ndarray:
        return np.concatenate([
            self.mean_color.flatten(),
            self.histogram.flatten(),
            [self.aspect_ratio, self.area_ratio],
        ])


@dataclass
class TrackState:
    track_id: int
    class_name: str
    bbox: Tuple[int, int, int, int]
    center: Tuple[int, int]
    frame_index: int
    age: int = 0
    hits: int = 0
    time_since_update: int = 0
    trajectory: List[Dict] = field(default_factory=list)
    state: str = TRACK_STATE_ACTIVE
    features: Optional[TrackFeature] = None
    lost_since_frame: int = 0


class KalmanBoxTracker:
    def __init__(self, bbox: Tuple[int, int, int, int], track_id: int, class_name: str):
        self.track_id = track_id
        self.class_name = class_name
        self.hits = 0
        self.age = 0
        self.time_since_update = 0
        self.trajectory: List[Dict] = []
        self.state = TRACK_STATE_ACTIVE
        self.features: Optional[TrackFeature] = None
        self.lost_since_frame = 0
        self.original_class_name = class_name

        if FILTERPY_AVAILABLE:
            self.kf = KalmanFilter(dim_x=7, dim_z=4)
            self.kf.F = np.array([
                [1, 0, 0, 0, 1, 0, 0],
                [0, 1, 0, 0, 0, 1, 0],
                [0, 0, 1, 0, 0, 0, 1],
                [0, 0, 0, 1, 0, 0, 0],
                [0, 0, 0, 0, 1, 0, 0],
                [0, 0, 0, 0, 0, 1, 0],
                [0, 0, 0, 0, 0, 0, 1],
            ])
            self.kf.H = np.array([
                [1, 0, 0, 0, 0, 0, 0],
                [0, 1, 0, 0, 0, 0, 0],
                [0, 0, 1, 0, 0, 0, 0],
                [0, 0, 0, 1, 0, 0, 0],
            ])
            self.kf.R[2:, 2:] *= 10.0
            self.kf.P[4:, 4:] *= 1000.0
            self.kf.P *= 10.0
            self.kf.Q[-1, -1] *= 0.01
            self.kf.Q[4:, 4:] *= 0.01

            x, y, w, h = bbox
            self.kf.x[:4] = np.array([x, y, w, h]).reshape(4, 1)
            self._use_kf = True
        else:
            self._bbox = bbox
            self._velocity = np.zeros(4)
            self._use_kf = False

        self.last_bbox = bbox
        self._update_trajectory(bbox, 0)

    def update(self, bbox: Tuple[int, int, int, int], frame_index: int, features: Optional[TrackFeature] = None):
        self.time_since_update = 0
        self.hits += 1
        self.last_bbox = bbox
        self.state = TRACK_STATE_ACTIVE
        self.lost_since_frame = 0

        if self._use_kf:
            self.kf.update(np.array(bbox).reshape(4, 1))
        else:
            old_center = np.array(self._bbox[:2])
            new_center = np.array(bbox[:2])
            self._velocity = (new_center - old_center) * 0.6 + self._velocity * 0.4
            self._bbox = bbox

        if features is not None:
            if self.features is None:
                self.features = features
            else:
                self._update_features(features)

        self._update_trajectory(bbox, frame_index)

    def predict(self) -> Tuple[int, int, int, int]:
        self.age += 1
        if self.time_since_update > 0:
            self.hits = 0
        self.time_since_update += 1

        if self._use_kf:
            self.kf.predict()
            x, y, w, h = self.kf.x[:4].flatten()
            return (int(max(0, x)), int(max(0, y)), int(max(1, w)), int(max(1, h)))
        else:
            x, y, w, h = self._bbox
            vx, vy = self._velocity[:2]
            x = int(max(0, x + vx))
            y = int(max(0, y + vy))
            return (x, y, w, h)

    def get_state(self) -> Tuple[int, int, int, int]:
        if self._use_kf:
            x, y, w, h = self.kf.x[:4].flatten()
            return (int(max(0, x)), int(max(0, y)), int(max(1, w)), int(max(1, h)))
        else:
            return self._bbox

    def mark_lost(self, current_frame: int):
        self.state = TRACK_STATE_LOST
        if self.lost_since_frame == 0:
            self.lost_since_frame = current_frame

    def mark_deleted(self):
        self.state = TRACK_STATE_DELETED

    def _update_trajectory(self, bbox: Tuple[int, int, int, int], frame_index: int):
        x, y, w, h = bbox
        self.trajectory.append({
            "x": int(x + w / 2),
            "y": int(y + h / 2),
            "frame": frame_index,
            "bbox": {"x": x, "y": y, "width": w, "height": h},
        })
        if len(self.trajectory) > 1000:
            self.trajectory = self.trajectory[-1000:]

    def _update_features(self, new_features: TrackFeature, alpha: float = 0.3):
        if self.features is None:
            self.features = new_features
            return

        self.features.mean_color = (1 - alpha) * self.features.mean_color + alpha * new_features.mean_color
        self.features.histogram = (1 - alpha) * self.features.histogram + alpha * new_features.histogram
        self.features.aspect_ratio = (1 - alpha) * self.features.aspect_ratio + alpha * new_features.aspect_ratio
        self.features.area_ratio = (1 - alpha) * self.features.area_ratio + alpha * new_features.area_ratio

    def get_predicted_position_at(self, frame_delta: int) -> Tuple[int, int, int, int]:
        x, y, w, h = self.get_state()

        if len(self.trajectory) >= 2:
            recent = self.trajectory[-5:]
            if len(recent) >= 2:
                vx = recent[-1]["x"] - recent[0]["x"]
                vy = recent[-1]["y"] - recent[0]["y"]
                frames = recent[-1]["frame"] - recent[0]["frame"]
                if frames > 0:
                    x += int((vx / frames) * frame_delta)
                    y += int((vy / frames) * frame_delta)

        return (x, y, w, h)


class DeepSORTTracker:
    def __init__(
        self,
        max_age: int = 30,
        min_hits: int = 3,
        iou_threshold: float = 0.3,
        feature_threshold: float = 0.7,
        max_lost_frames: int = 200,
    ):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.feature_threshold = feature_threshold
        self.max_lost_frames = max_lost_frames

        self.active_tracks: List[KalmanBoxTracker] = []
        self.lost_tracks: deque = deque(maxlen=50)

        self._next_id = 1
        self._frame_index = 0
        self._id_reuse_count: Dict[int, int] = defaultdict(int)

    def reset(self):
        self.active_tracks = []
        self.lost_tracks = deque(maxlen=50)
        self._next_id = 1
        self._frame_index = 0
        self._id_reuse_count.clear()

    def _extract_features(
        self,
        image: Optional[np.ndarray],
        bbox: Tuple[int, int, int, int],
        class_name: str,
    ) -> Optional[TrackFeature]:
        if image is None:
            return None

        x, y, w, h = bbox
        x1 = max(0, x)
        y1 = max(0, y)
        x2 = min(image.shape[1], x + w)
        y2 = min(image.shape[0], y + h)

        if x2 <= x1 or y2 <= y1:
            return None

        patch = image[y1:y2, x1:x2]
        if patch.size == 0:
            return None

        try:
            if len(patch.shape) == 3:
                mean_color = np.mean(patch, axis=(0, 1)) / 255.0
                gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
            else:
                mean_color = np.array([np.mean(patch) / 255.0])
                gray = patch

            hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
            hist = cv2.normalize(hist, hist).flatten()

            aspect_ratio = w / max(h, 1)
            area_ratio = (w * h) / max(image.shape[0] * image.shape[1], 1)

            return TrackFeature(
                mean_color=mean_color,
                histogram=hist,
                aspect_ratio=aspect_ratio,
                area_ratio=area_ratio,
                class_name=class_name,
            )
        except Exception as e:
            logger.debug(f"Feature extraction error: {e}")
            return None

    def _compute_feature_distance(
        self, feat1: Optional[TrackFeature], feat2: Optional[TrackFeature]
    ) -> float:
        if feat1 is None or feat2 is None:
            return 1.0

        if feat1.class_name != feat2.class_name:
            return 1.0

        try:
            arr1 = feat1.to_array()
            arr2 = feat2.to_array()
            dist = np.linalg.norm(arr1 - arr2)
            normalized = 1.0 / (1.0 + dist)
            return 1.0 - normalized
        except Exception:
            return 1.0

    def _match_with_lost_tracks(
        self,
        unmatched_detections: List[int],
        detections: List[Tuple[int, int, int, int]],
        class_names: List[str],
        features_list: List[Optional[TrackFeature]],
        image: Optional[np.ndarray],
    ) -> Tuple[List[Tuple[int, int]], List[int]]:
        if not self.lost_tracks or not unmatched_detections:
            return [], unmatched_detections

        matched_pairs = []
        still_unmatched = []

        lost_track_list = list(self.lost_tracks)

        for d_idx in unmatched_detections:
            best_match = None
            best_score = self.feature_threshold

            det_bbox = detections[d_idx]
            det_class = class_names[d_idx]
            det_feature = features_list[d_idx]

            det_center = np.array([det_bbox[0] + det_bbox[2] / 2, det_bbox[1] + det_bbox[3] / 2])

            for lost_idx, lost_track in enumerate(lost_track_list):
                if lost_track.original_class_name != det_class:
                    continue

                frames_lost = self._frame_index - lost_track.lost_since_frame
                if frames_lost > self.max_lost_frames:
                    continue

                predicted_bbox = lost_track.get_predicted_position_at(frames_lost)
                pred_center = np.array([
                    predicted_bbox[0] + predicted_bbox[2] / 2,
                    predicted_bbox[1] + predicted_bbox[3] / 2,
                ])

                center_dist = np.linalg.norm(det_center - pred_center)
                max_allowed_dist = (det_bbox[2] + det_bbox[3]) * 2.0

                if center_dist > max_allowed_dist:
                    continue

                iou = self._compute_iou(det_bbox, predicted_bbox)
                feat_dist = self._compute_feature_distance(lost_track.features, det_feature)

                score = 0.6 * (1.0 - feat_dist) + 0.4 * iou

                if score > best_score:
                    best_score = score
                    best_match = (lost_idx, lost_track)

            if best_match is not None:
                lost_idx, lost_track = best_match
                lost_track.update(det_bbox, self._frame_index, det_feature)
                lost_track.state = TRACK_STATE_ACTIVE

                if lost_track in self.lost_tracks:
                    self.lost_tracks.remove(lost_track)

                self.active_tracks.append(lost_track)
                self._id_reuse_count[lost_track.track_id] += 1

                matched_pairs.append((lost_track.track_id, d_idx))
                logger.info(
                    f"Track ID {lost_track.track_id} recovered after "
                    f"{self._frame_index - lost_track.lost_since_frame} frames "
                    f"(reuse count: {self._id_reuse_count[lost_track.track_id]})"
                )
            else:
                still_unmatched.append(d_idx)

        return matched_pairs, still_unmatched

    def update(
        self,
        detections: List[Tuple[int, int, int, int]],
        class_names: List[str],
        confidences: List[float],
        image: Optional[np.ndarray] = None,
    ) -> List[Dict]:
        self._frame_index += 1

        features_list = []
        for i, det in enumerate(detections):
            cls = class_names[i] if i < len(class_names) else "unknown"
            feat = self._extract_features(image, det, cls)
            features_list.append(feat)

        predicted_boxes = []
        for tracker in self.active_tracks:
            pred = tracker.predict()
            predicted_boxes.append(pred)

        if detections:
            matched_indices, unmatched_dets, unmatched_trks = self._match_detections(
                predicted_boxes, detections
            )
        else:
            matched_indices = []
            unmatched_dets = list(range(len(detections)))
            unmatched_trks = list(range(len(self.active_tracks)))

        for t_idx, d_idx in matched_indices:
            if t_idx < len(self.active_tracks):
                feat = features_list[d_idx] if d_idx < len(features_list) else None
                self.active_tracks[t_idx].update(
                    detections[d_idx],
                    self._frame_index,
                    feat,
                )
                if d_idx < len(class_names):
                    self.active_tracks[t_idx].class_name = class_names[d_idx]

        for t_idx in unmatched_trks:
            if t_idx < len(self.active_tracks):
                track = self.active_tracks[t_idx]
                track.time_since_update += 1

                if track.time_since_update > self.max_age:
                    track.mark_lost(self._frame_index)
                    self.lost_tracks.append(track)
                    logger.debug(f"Track {track.track_id} moved to lost pool")

        self.active_tracks = [
            t for t in self.active_tracks if t.state == TRACK_STATE_ACTIVE
        ]

        if unmatched_dets and self.lost_tracks:
            recovered, still_unmatched = self._match_with_lost_tracks(
                unmatched_dets, detections, class_names, features_list, image
            )
            unmatched_dets = still_unmatched

        for d_idx in unmatched_dets:
            if d_idx < len(detections) and d_idx < len(class_names):
                feat = features_list[d_idx] if d_idx < len(features_list) else None
                new_tracker = KalmanBoxTracker(
                    detections[d_idx],
                    self._next_id,
                    class_names[d_idx],
                )
                new_tracker.features = feat
                self.active_tracks.append(new_tracker)
                self._next_id += 1

        self.lost_tracks = deque(
            [t for t in self.lost_tracks
             if self._frame_index - t.lost_since_frame <= self.max_lost_frames],
            maxlen=50
        )

        results = []
        for tracker in self.active_tracks:
            if tracker.hits >= self.min_hits or tracker.age <= self.min_hits:
                bbox = tracker.get_state()
                results.append({
                    "track_id": tracker.track_id,
                    "class_name": tracker.class_name,
                    "bbox": bbox,
                    "frame_index": self._frame_index,
                    "trajectory": tracker.trajectory.copy(),
                    "is_active": tracker.time_since_update == 0,
                    "reused": self._id_reuse_count.get(tracker.track_id, 0) > 0,
                    "reuse_count": self._id_reuse_count.get(tracker.track_id, 0),
                })

        return results

    def _compute_iou_matrix(
        self, boxes_a: List[Tuple], boxes_b: List[Tuple]
    ) -> np.ndarray:
        if not boxes_a or not boxes_b:
            return np.zeros((len(boxes_a), len(boxes_b)))

        num_a = len(boxes_a)
        num_b = len(boxes_b)
        iou_matrix = np.zeros((num_a, num_b))

        for i, box_a in enumerate(boxes_a):
            for j, box_b in enumerate(boxes_b):
                iou_matrix[i, j] = self._compute_iou(box_a, box_b)

        return iou_matrix

    def _compute_iou(
        self, box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]
    ) -> float:
        x1 = max(box_a[0], box_b[0])
        y1 = max(box_a[1], box_b[1])
        x2 = min(box_a[0] + box_a[2], box_b[0] + box_b[2])
        y2 = min(box_a[1] + box_a[3], box_b[1] + box_b[3])

        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = box_a[2] * box_a[3]
        area_b = box_b[2] * box_b[3]
        union = area_a + area_b - intersection

        return intersection / union if union > 0 else 0.0

    def _match_detections(
        self,
        predicted_boxes: List[Tuple],
        detections: List[Tuple],
    ) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        if not predicted_boxes:
            return [], list(range(len(detections))), []
        if not detections:
            return [], [], list(range(len(predicted_boxes)))

        iou_matrix = self._compute_iou_matrix(predicted_boxes, detections)
        cost_matrix = 1.0 - iou_matrix

        matched_indices = []
        unmatched_trks = []
        unmatched_dets = []

        if cost_matrix.size > 0:
            row_indices, col_indices = linear_sum_assignment(cost_matrix)
            for row, col in zip(row_indices, col_indices):
                if iou_matrix[row, col] >= self.iou_threshold:
                    matched_indices.append((row, col))
                else:
                    unmatched_trks.append(row)
                    unmatched_dets.append(col)

        matched_rows = set(i for i, _ in matched_indices)
        matched_cols = set(j for _, j in matched_indices)

        for i in range(len(predicted_boxes)):
            if i not in matched_rows:
                unmatched_trks.append(i)

        for j in range(len(detections)):
            if j not in matched_cols:
                unmatched_dets.append(j)

        return matched_indices, unmatched_dets, unmatched_trks

    def get_track_statistics(self) -> Dict:
        stats = defaultdict(lambda: {"count": 0, "total_length": 0})
        all_tracks = list(self.active_tracks) + list(self.lost_tracks)
        for tracker in all_tracks:
            cls = tracker.class_name
            stats[cls]["count"] += 1
            stats[cls]["total_length"] += len(tracker.trajectory)

        return {
            **dict(stats),
            "_metadata": {
                "active_tracks": len(self.active_tracks),
                "lost_tracks": len(self.lost_tracks),
                "total_ids_created": self._next_id - 1,
                "total_recoveries": sum(self._id_reuse_count.values()),
            },
        }


tracker = DeepSORTTracker()
