import numpy as np
from typing import Optional, Tuple
from config import settings
from sklearn.impute import KNNImputer


class DataPreprocessor:
    def __init__(self):
        self.elements = settings.ELEMENTS

    def sum_normalization(self, data: np.ndarray) -> np.ndarray:
        row_sums = data.sum(axis=1, keepdims=True)
        normalized = data / row_sums * 100
        return normalized

    def clr_transform(self, data: np.ndarray) -> np.ndarray:
        data = np.maximum(data, 1e-6)
        geometric_means = np.exp(np.mean(np.log(data), axis=1, keepdims=True))
        clr_data = np.log(data / geometric_means)
        return clr_data

    def alr_transform(self, data: np.ndarray, denominator_idx: int = -1) -> np.ndarray:
        data = np.maximum(data, 1e-6)
        denominator = data[:, denominator_idx:denominator_idx+1]
        alr_data = np.log(data[:, :-1] / denominator) if denominator_idx == -1 else np.log(np.delete(data, denominator_idx, axis=1) / denominator)
        return alr_data

    def knn_impute(self, data: np.ndarray, n_neighbors: int = 5) -> np.ndarray:
        imputer = KNNImputer(n_neighbors=n_neighbors)
        imputed_data = imputer.fit_transform(data)
        return imputed_data

    def preprocess(self, data: np.ndarray, method: str = "sum", impute_missing: bool = True) -> np.ndarray:
        processed_data = data.copy()

        if impute_missing and np.isnan(processed_data).any():
            processed_data = self.knn_impute(processed_data)

        if method == "sum":
            processed_data = self.sum_normalization(processed_data)
        elif method == "clr":
            processed_data = self.sum_normalization(processed_data)
            processed_data = self.clr_transform(processed_data)
        elif method == "alr":
            processed_data = self.sum_normalization(processed_data)
            processed_data = self.alr_transform(processed_data)

        return processed_data

    def validate_composition(self, data: np.ndarray) -> Tuple[bool, Optional[str]]:
        if data.shape[1] != len(self.elements):
            return False, f"Expected {len(self.elements)} elements, got {data.shape[1]}"

        if np.any(data < 0):
            return False, "Negative values found in composition data"

        return True, None


preprocessor = DataPreprocessor()
