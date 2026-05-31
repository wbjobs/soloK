import numpy as np
from typing import List, Dict, Tuple
from filterpy.kalman import KalmanFilter
from scipy.optimize import linear_sum_assignment
import cv2


class KalmanBoxTracker:
    count = 0

    def __init__(self, bbox: List[float], confidence: float):
        self.kf = KalmanFilter(dim_x=7, dim_z=4)
        self.kf.F = np.array([
            [1, 0, 0, 0, 1, 0, 0],
            [0, 1, 0, 0, 0, 1, 0],
            [0, 0, 1, 0, 0, 0, 1],
            [0, 0, 0, 1, 0, 0, 0],
            [0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 1]
        ])
        self.kf.H = np.array([
            [1, 0, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0],
            [0, 0, 0, 1, 0, 0, 0]
        ])

        self.kf.R[2:, 2:] *= 10.0
        self.kf.P[4:, 4:] *= 1000.0
        self.kf.P *= 10.0
        self.kf.Q[-1, -1] *= 0.01
        self.kf.Q[4:, 4:] *= 0.01

        x1, y1, x2, y2 = bbox
        w = x2 - x1
        h = y2 - y1
        cx = x1 + w / 2
        cy = y1 + h / 2
        s = w * h
        r = w / float(h)

        self.kf.x[:4] = np.array([cx, cy, s, r]).reshape((4, 1))
        self.confidence = confidence
        self.id = KalmanBoxTracker.count
        KalmanBoxTracker.count += 1
        self.age = 0
        self.hits = 0
        self.time_since_update = 0
        self.history = []
        self.hit_streak = 0
        self.features = []

    def update(self, bbox: List[float], confidence: float, feature: np.ndarray = None):
        self.time_since_update = 0
        self.history = []
        self.hits += 1
        self.hit_streak += 1
        self.confidence = confidence

        x1, y1, x2, y2 = bbox
        w = x2 - x1
        h = y2 - y1
        cx = x1 + w / 2
        cy = y1 + h / 2
        s = w * h
        r = w / float(h)

        self.kf.update(np.array([cx, cy, s, r]).reshape((4, 1)))

        if feature is not None:
            self.features.append(feature)
            if len(self.features) > 100:
                self.features.pop(0)

    def predict(self) -> np.ndarray:
        if (self.kf.x[6] + self.kf.x[2]) <= 0:
            self.kf.x[6] *= 0.0
        self.kf.predict()
        self.age += 1
        if self.time_since_update > 0:
            self.hit_streak = 0
        self.time_since_update += 1
        self.history.append(self._get_bbox())
        return self.history[-1]

    def get_state(self) -> np.ndarray:
        return self._get_bbox()

    def _get_bbox(self) -> np.ndarray:
        cx, cy, s, r = self.kf.x[:4].flatten()
        w = np.sqrt(s * r)
        h = s / w
        x1 = cx - w / 2
        y1 = cy - h / 2
        x2 = cx + w / 2
        y2 = cy + h / 2
        return np.array([x1, y1, x2, y2])


def iou(bbox1: np.ndarray, bbox2: np.ndarray) -> float:
    x1, y1, x2, y2 = bbox1
    x1_p, y1_p, x2_p, y2_p = bbox2

    xi1 = max(x1, x1_p)
    yi1 = max(y1, y1_p)
    xi2 = min(x2, x2_p)
    yi2 = min(y2, y2_p)

    inter_area = max(0, xi2 - xi1) * max(0, yi2 - yi1)

    bbox1_area = (x2 - x1) * (y2 - y1)
    bbox2_area = (x2_p - x1_p) * (y2_p - y1_p)

    union_area = bbox1_area + bbox2_area - inter_area

    if union_area == 0:
        return 0.0

    return inter_area / union_area


def extract_feature(frame: np.ndarray, bbox: List[float]) -> np.ndarray:
    x1, y1, x2, y2 = [int(max(0, coord)) for coord in bbox]
    if x2 <= x1 or y2 <= y1:
        return np.zeros(128)

    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros(128)

    try:
        crop = cv2.resize(crop, (64, 128))
        crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        crop = cv2.normalize(crop, None, 0, 255, cv2.NORM_MINMAX)

        feature = cv2.HuMoments(cv2.moments(crop)).flatten()
        hist = cv2.calcHist([crop], [0], None, [16], [0, 256]).flatten()
        hist = hist / (hist.sum() + 1e-7)

        feature = np.concatenate([feature, hist])
        if len(feature) < 128:
            feature = np.pad(feature, (0, 128 - len(feature)))
        else:
            feature = feature[:128]

        feature = feature / (np.linalg.norm(feature) + 1e-7)
    except Exception:
        feature = np.zeros(128)

    return feature


def feature_similarity(f1: np.ndarray, f2: np.ndarray) -> float:
    return np.dot(f1, f2) / (np.linalg.norm(f1) * np.linalg.norm(f2) + 1e-7)


class DeepSORTTracker:
    def __init__(
        self,
        max_age: int = 30,
        min_hits: int = 3,
        iou_threshold: float = 0.3,
        feature_threshold: float = 0.7
    ):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.feature_threshold = feature_threshold
        self.trackers: List[KalmanBoxTracker] = []
        self.frame_count = 0

    def _match_detections_to_trackers(
        self,
        detections: List[List[float]],
        features: List[np.ndarray],
        trackers: List[KalmanBoxTracker]
    ) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        if len(trackers) == 0:
            return [], list(range(len(detections))), []

        if len(detections) == 0:
            return [], [], list(range(len(trackers)))

        iou_matrix = np.zeros((len(detections), len(trackers)), dtype=np.float32)
        feature_matrix = np.zeros((len(detections), len(trackers)), dtype=np.float32)

        for d, det in enumerate(detections):
            det_bbox = det[:4]
            for t, trk in enumerate(trackers):
                trk_bbox = trk.get_state()
                iou_matrix[d, t] = iou(det_bbox, trk_bbox)

                if trk.features and features[d] is not None:
                    sims = [feature_similarity(features[d], f) for f in trk.features]
                    feature_matrix[d, t] = max(sims) if sims else 0.0
                else:
                    feature_matrix[d, t] = 0.0

        combined_matrix = 0.5 * iou_matrix + 0.5 * feature_matrix
        cost_matrix = -combined_matrix

        matched_indices = []
        unmatched_detections = []
        unmatched_trackers = []

        try:
            row_ind, col_ind = linear_sum_assignment(cost_matrix)

            for d, t in zip(row_ind, col_ind):
                if iou_matrix[d, t] < self.iou_threshold and feature_matrix[d, t] < self.feature_threshold:
                    unmatched_detections.append(d)
                    unmatched_trackers.append(t)
                else:
                    matched_indices.append((d, t))

            matched_d = set(d for d, t in matched_indices)
            matched_t = set(t for d, t in matched_indices)

            for d in range(len(detections)):
                if d not in matched_d:
                    unmatched_detections.append(d)

            for t in range(len(trackers)):
                if t not in matched_t:
                    unmatched_trackers.append(t)
        except Exception:
            matched_indices = []
            unmatched_detections = list(range(len(detections)))
            unmatched_trackers = list(range(len(trackers)))

        return matched_indices, unmatched_detections, unmatched_trackers

    def update(self, detections: List[List[float]], frame: np.ndarray) -> None:
        self.frame_count += 1

        features = []
        for det in detections:
            bbox = det[:4]
            feature = extract_feature(frame, bbox)
            features.append(feature)

        trackers = [trk for trk in self.trackers]
        for trk in trackers:
            trk.predict()

        matched, unmatched_dets, unmatched_trks = self._match_detections_to_trackers(
            detections, features, trackers
        )

        for d, t in matched:
            bbox = detections[d][:4]
            confidence = detections[d][4]
            trackers[t].update(bbox, confidence, features[d])

        for d in unmatched_dets:
            bbox = detections[d][:4]
            confidence = detections[d][4]
            new_tracker = KalmanBoxTracker(bbox, confidence)
            new_tracker.features.append(features[d])
            self.trackers.append(new_tracker)

        self.trackers = [
            trk for trk in self.trackers
            if trk.time_since_update < self.max_age
        ]

    def get_tracks(self) -> List[Dict]:
        tracks = []
        for trk in self.trackers:
            if trk.time_since_update > 0:
                continue

            if trk.hits < self.min_hits and self.frame_count < self.min_hits:
                continue

            bbox = trk.get_state().tolist()
            bbox = [max(0, coord) for coord in bbox]

            tracks.append({
                "track_id": trk.id,
                "bbox": bbox,
                "confidence": trk.confidence,
                "age": trk.age,
                "hits": trk.hits
            })

        return tracks

    def reset(self) -> None:
        self.trackers = []
        self.frame_count = 0
        KalmanBoxTracker.count = 0
