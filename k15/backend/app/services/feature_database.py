import numpy as np
import json
import os
import hashlib
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
from app.core.logging import logger


@dataclass
class FeatureRecord:
    record_id: str
    target_id: str
    mission_id: int
    class_name: str
    feature_vector: List[float]
    bbox: Dict
    confidence: float
    created_at: str
    image_path: Optional[str] = None

    def to_dict(self) -> Dict:
        return asdict(self)


class FeatureDatabase:
    def __init__(self, db_path: str = "data/feature_database"):
        self.db_path = db_path
        self.records: List[FeatureRecord] = []
        self.feature_vectors: Optional[np.ndarray] = None
        self.class_indices: Dict[str, List[int]] = {}

        os.makedirs(db_path, exist_ok=True)
        self._load_existing_records()

    def _load_existing_records(self):
        index_file = os.path.join(self.db_path, "index.json")
        if os.path.exists(index_file):
            try:
                with open(index_file, "r") as f:
                    data = json.load(f)

                for item in data.get("records", []):
                    record = FeatureRecord(
                        record_id=item["record_id"],
                        target_id=item["target_id"],
                        mission_id=item["mission_id"],
                        class_name=item["class_name"],
                        feature_vector=item["feature_vector"],
                        bbox=item["bbox"],
                        confidence=item["confidence"],
                        created_at=item["created_at"],
                        image_path=item.get("image_path"),
                    )
                    self.records.append(record)

                self._rebuild_index()
                logger.info(f"Loaded {len(self.records)} feature records")

            except Exception as e:
                logger.error(f"Failed to load feature database: {e}")

    def _save_index(self):
        index_file = os.path.join(self.db_path, "index.json")
        try:
            with open(index_file, "w") as f:
                json.dump({
                    "records": [r.to_dict() for r in self.records],
                    "metadata": {
                        "total_records": len(self.records),
                        "last_updated": datetime.now().isoformat(),
                    },
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save feature database: {e}")

    def _rebuild_index(self):
        if not self.records:
            self.feature_vectors = None
            self.class_indices = {}
            return

        vectors = []
        self.class_indices = {}

        for idx, record in enumerate(self.records):
            vectors.append(record.feature_vector)

            if record.class_name not in self.class_indices:
                self.class_indices[record.class_name] = []
            self.class_indices[record.class_name].append(idx)

        self.feature_vectors = np.array(vectors, dtype=np.float32)

    def add_record(
        self,
        target_id: str,
        mission_id: int,
        class_name: str,
        feature_vector: List[float],
        bbox: Dict,
        confidence: float,
        image_path: Optional[str] = None,
    ) -> str:
        record_id = hashlib.md5(
            f"{target_id}_{mission_id}_{datetime.now().isoformat()}".encode()
        ).hexdigest()[:16]

        record = FeatureRecord(
            record_id=record_id,
            target_id=target_id,
            mission_id=mission_id,
            class_name=class_name,
            feature_vector=feature_vector,
            bbox=bbox,
            confidence=confidence,
            created_at=datetime.now().isoformat(),
            image_path=image_path,
        )

        self.records.append(record)
        self._rebuild_index()
        self._save_index()

        logger.info(f"Added feature record: {record_id} ({class_name})")
        return record_id

    def search_similar(
        self,
        query_vector: List[float],
        class_name: Optional[str] = None,
        top_k: int = 10,
        threshold: float = 0.5,
    ) -> List[Dict]:
        if not self.records or self.feature_vectors is None:
            return []

        query = np.array(query_vector, dtype=np.float32)

        if class_name and class_name in self.class_indices:
            indices = self.class_indices[class_name]
            if not indices:
                return []
            vectors = self.feature_vectors[indices]
        else:
            indices = list(range(len(self.records)))
            vectors = self.feature_vectors

        similarities = self._cosine_similarity(query, vectors)

        results = []
        for i, sim in enumerate(similarities):
            if sim >= threshold:
                actual_idx = indices[i]
                record = self.records[actual_idx]
                results.append({
                    "record": record.to_dict(),
                    "similarity": float(sim),
                })

        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]

    def search_by_image_region(
        self,
        image: np.ndarray,
        bbox: Tuple[int, int, int, int],
        class_name: str,
        top_k: int = 10,
        threshold: float = 0.5,
    ) -> List[Dict]:
        from app.services.feature_extractor import feature_extractor

        features = feature_extractor.extract_features(
            image, bbox, class_name
        )

        if features is None:
            return []

        query_vector = features.to_feature_vector().tolist()

        return self.search_similar(query_vector, class_name, top_k, threshold)

    def _cosine_similarity(
        self,
        query: np.ndarray,
        vectors: np.ndarray,
    ) -> np.ndarray:
        query_norm = query / (np.linalg.norm(query) + 1e-10)
        vectors_norm = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-10)
        return np.dot(vectors_norm, query_norm)

    def get_statistics(self) -> Dict:
        if not self.records:
            return {"total_records": 0, "classes": {}}

        class_counts = {}
        for record in self.records:
            cls = record.class_name
            class_counts[cls] = class_counts.get(cls, 0) + 1

        return {
            "total_records": len(self.records),
            "classes": class_counts,
        }

    def delete_record(self, record_id: str) -> bool:
        for i, record in enumerate(self.records):
            if record.record_id == record_id:
                self.records.pop(i)
                self._rebuild_index()
                self._save_index()
                logger.info(f"Deleted feature record: {record_id}")
                return True
        return False

    def clear_database(self):
        self.records = []
        self.feature_vectors = None
        self.class_indices = {}

        index_file = os.path.join(self.db_path, "index.json")
        if os.path.exists(index_file):
            os.remove(index_file)

        logger.info("Feature database cleared")


feature_database = FeatureDatabase()
