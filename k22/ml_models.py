import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Any
from sklearn.decomposition import PCA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.ensemble import RandomForestRegressor
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import joblib
import os
from config import settings
from database import SessionLocal, KilnSample
from preprocessing import preprocessor


class CeramicAnalysisModel:
    MODEL_VERSION = "2.0"

    def __init__(self):
        self.elements = settings.ELEMENTS
        self.model_dir = "models"
        os.makedirs(self.model_dir, exist_ok=True)

        self.pca = None
        self.lda = None
        self.rf_regressor = None
        self.scaler = None
        self.kiln_encoder = {}
        self.kiln_decoder = {}
        self.year_correction_params = None
        self.reference_data = None
        self.is_trained = False

        self._load_or_train_models()

    def _load_training_data(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        db = SessionLocal()
        samples = db.query(KilnSample).all()
        db.close()

        if not samples:
            raise Exception("No training data found in database")

        X = []
        y_kiln = []
        y_year = []

        for sample in samples:
            composition = [getattr(sample, elem) for elem in self.elements]
            X.append(composition)
            y_kiln.append(sample.kiln_id)
            y_year.append(sample.year)

        X = np.array(X)
        y_kiln = np.array(y_kiln)
        y_year = np.array(y_year)

        return X, y_kiln, y_year

    def _encode_kiln_labels(self, y_kiln: np.ndarray) -> np.ndarray:
        unique_kilns = sorted(set(y_kiln))
        self.kiln_encoder = {kiln: i for i, kiln in enumerate(unique_kilns)}
        self.kiln_decoder = {i: kiln for kiln, i in self.kiln_encoder.items()}
        return np.array([self.kiln_encoder[kiln] for kiln in y_kiln])

    def _train_models(self, X: np.ndarray, y_kiln: np.ndarray, y_year: np.ndarray):
        X_processed = preprocessor.preprocess(X, method="clr")

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X_processed)

        self.pca = PCA(n_components=3)
        self.pca.fit(X_scaled)

        y_encoded = self._encode_kiln_labels(y_kiln)
        self.lda = LinearDiscriminantAnalysis(
            solver='eigen',
            shrinkage='auto',
            tol=1e-4
        )
        self.lda.fit(X_scaled, y_encoded)

        sample_weights = self._calculate_year_weights(y_year)

        self.rf_regressor = RandomForestRegressor(
            n_estimators=150,
            max_depth=18,
            min_samples_split=4,
            min_samples_leaf=2,
            random_state=42
        )
        self.rf_regressor.fit(X_scaled, y_year, sample_weight=sample_weights)

        self._calculate_year_correction(X_scaled, y_year)

        self._save_models()
        self.is_trained = True

    def _calculate_year_weights(self, y_year: np.ndarray) -> np.ndarray:
        weights = np.ones_like(y_year, dtype=float)
        early_mask = y_year < 1000
        mid_mask = (y_year >= 1000) & (y_year < 1400)
        weights[early_mask] = 3.0
        weights[mid_mask] = 1.8
        return weights

    def _calculate_year_correction(self, X_scaled: np.ndarray, y_true: np.ndarray):
        y_pred = self.rf_regressor.predict(X_scaled)
        errors = y_true - y_pred

        self.year_correction_params = {
            "bins": [-np.inf, 800, 1000, 1200, 1400, 1600, np.inf],
            "corrections": {}
        }

        for i in range(len(self.year_correction_params["bins"]) - 1):
            bin_start = self.year_correction_params["bins"][i]
            bin_end = self.year_correction_params["bins"][i + 1]
            mask = (y_pred >= bin_start) & (y_pred < bin_end)
            if np.sum(mask) > 0:
                mean_error = np.mean(errors[mask])
                self.year_correction_params["corrections"][f"{bin_start}_{bin_end}"] = {
                    "correction": float(mean_error),
                    "count": int(np.sum(mask))
                }
            else:
                self.year_correction_params["corrections"][f"{bin_start}_{bin_end}"] = {
                    "correction": 0.0,
                    "count": 0
                }

    def _save_models(self):
        joblib.dump(self.pca, os.path.join(self.model_dir, "pca_model.pkl"))
        joblib.dump(self.lda, os.path.join(self.model_dir, "lda_model.pkl"))
        joblib.dump(self.rf_regressor, os.path.join(self.model_dir, "rf_regressor.pkl"))
        joblib.dump(self.scaler, os.path.join(self.model_dir, "scaler.pkl"))
        joblib.dump((self.kiln_encoder, self.kiln_decoder), os.path.join(self.model_dir, "label_encoders.pkl"))
        joblib.dump(self.year_correction_params, os.path.join(self.model_dir, "year_correction.pkl"))
        joblib.dump(self.MODEL_VERSION, os.path.join(self.model_dir, "model_version.pkl"))

    def _load_or_train_models(self):
        model_files = [
            "pca_model.pkl", "lda_model.pkl", "rf_regressor.pkl",
            "scaler.pkl", "label_encoders.pkl", "year_correction.pkl",
            "model_version.pkl"
        ]
        all_exist = all(os.path.exists(os.path.join(self.model_dir, f)) for f in model_files)

        if all_exist:
            try:
                loaded_version = joblib.load(os.path.join(self.model_dir, "model_version.pkl"))
                if loaded_version != self.MODEL_VERSION:
                    print(f"Model version mismatch: found {loaded_version}, need {self.MODEL_VERSION}. Retraining...")
                    raise Exception("Version mismatch")

                self.pca = joblib.load(os.path.join(self.model_dir, "pca_model.pkl"))
                self.lda = joblib.load(os.path.join(self.model_dir, "lda_model.pkl"))
                self.rf_regressor = joblib.load(os.path.join(self.model_dir, "rf_regressor.pkl"))
                self.scaler = joblib.load(os.path.join(self.model_dir, "scaler.pkl"))
                self.kiln_encoder, self.kiln_decoder = joblib.load(os.path.join(self.model_dir, "label_encoders.pkl"))
                self.year_correction_params = joblib.load(os.path.join(self.model_dir, "year_correction.pkl"))
                self.is_trained = True
                return
            except Exception as e:
                print(f"Could not load existing models: {e}. Will retrain.")

        try:
            X, y_kiln, y_year = self._load_training_data()
            self._train_models(X, y_kiln, y_year)
        except Exception as e:
            print(f"Warning: Could not train models: {e}")

    def get_pca_scores(self, X: np.ndarray) -> np.ndarray:
        X_processed = preprocessor.preprocess(X, method="clr")
        X_scaled = self.scaler.transform(X_processed)
        return self.pca.transform(X_scaled)

    def identify_kiln(self, X: np.ndarray) -> List[Dict[str, Any]]:
        X_processed = preprocessor.preprocess(X, method="clr")
        X_scaled = self.scaler.transform(X_processed)

        probabilities = self.lda.predict_proba(X_scaled)
        predictions = np.argmax(probabilities, axis=1)
        confidences = np.max(probabilities, axis=1)

        results = []
        for pred, conf in zip(predictions, confidences):
            kiln_id = self.kiln_decoder.get(pred, "unknown")
            kiln_name = settings.KILN_NAMES.get(kiln_id, kiln_id)
            results.append({
                "kiln_id": kiln_id,
                "kiln_name": kiln_name,
                "confidence": float(conf),
                "is_reliable": conf >= settings.CONFIDENCE_THRESHOLD
            })

        return results

    def predict_year(self, X: np.ndarray) -> List[Dict[str, Any]]:
        X_processed = preprocessor.preprocess(X, method="clr")
        X_scaled = self.scaler.transform(X_processed)

        predicted_years = self.rf_regressor.predict(X_scaled)
        corrected_years = self._apply_year_correction(predicted_years)
        error_range = settings.YEAR_ERROR_RANGE

        results = []
        for raw_year, corrected_year in zip(predicted_years, corrected_years):
            year_int = int(round(corrected_year))
            results.append({
                "predicted_year": year_int,
                "year_min": year_int - error_range,
                "year_max": year_int + error_range,
                "error_range": error_range,
                "raw_prediction": float(raw_year),
                "correction_applied": float(corrected_year - raw_year)
            })

        return results

    def _apply_year_correction(self, predicted_years: np.ndarray) -> np.ndarray:
        if not self.year_correction_params:
            return predicted_years

        corrected = predicted_years.copy()
        bins = self.year_correction_params["bins"]
        corrections = self.year_correction_params["corrections"]

        for i in range(len(bins) - 1):
            bin_start = bins[i]
            bin_end = bins[i + 1]
            key = f"{bin_start}_{bin_end}"
            if key in corrections:
                correction = corrections[key]["correction"]
                mask = (predicted_years >= bin_start) & (predicted_years < bin_end)
                corrected[mask] = predicted_years[mask] + correction

        dynamic_correction = np.zeros_like(predicted_years)
        early_mask = predicted_years < 1100
        mid_mask = (predicted_years >= 1100) & (predicted_years < 1400)
        dynamic_correction[early_mask] = -180 * (1 - (predicted_years[early_mask] / 1100))
        dynamic_correction[mid_mask] = -60 * (1 - ((predicted_years[mid_mask] - 1100) / 300))
        corrected = corrected + dynamic_correction

        return corrected

    def hierarchical_clustering(self, X: np.ndarray, n_clusters: int = None) -> Dict[str, Any]:
        X_processed = preprocessor.preprocess(X, method="clr")
        X_scaled = self.scaler.transform(X_processed)

        if n_clusters is None:
            best_score = -1
            best_n = 2
            max_clusters = min(10, len(X) - 1)
            for n in range(2, max_clusters + 1):
                clustering = AgglomerativeClustering(n_clusters=n)
                labels = clustering.fit_predict(X_scaled)
                score = silhouette_score(X_scaled, labels)
                if score > best_score:
                    best_score = score
                    best_n = n
            n_clusters = best_n

        clustering = AgglomerativeClustering(n_clusters=n_clusters)
        labels = clustering.fit_predict(X_scaled)

        cluster_sizes = {}
        for label in labels:
            cluster_sizes[int(label)] = cluster_sizes.get(int(label), 0) + 1

        pca_scores = self.pca.transform(X_scaled)

        suspicious_clusters = []
        for cluster_id, size in cluster_sizes.items():
            if size <= max(1, len(X) * 0.05):
                suspicious_clusters.append({
                    "cluster_id": cluster_id,
                    "size": size,
                    "suspected_reason": "Small cluster size - may indicate outliers or imitations"
                })

        return {
            "n_clusters": n_clusters,
            "cluster_labels": [int(l) for l in labels],
            "cluster_sizes": cluster_sizes,
            "pca_scores": pca_scores.tolist(),
            "suspicious_clusters": suspicious_clusters,
            "silhouette_score": float(silhouette_score(X_scaled, labels))
        }

    def get_reference_stats(self, kiln_id: str) -> Dict[str, Any]:
        db = SessionLocal()
        samples = db.query(KilnSample).filter(KilnSample.kiln_id == kiln_id).all()
        db.close()

        if not samples:
            return {}

        compositions = []
        years = []
        for sample in samples:
            comp = [getattr(sample, elem) for elem in self.elements]
            compositions.append(comp)
            years.append(sample.year)

        compositions = np.array(compositions)
        years = np.array(years)

        stats = {
            "kiln_id": kiln_id,
            "kiln_name": settings.KILN_NAMES.get(kiln_id, kiln_id),
            "sample_count": len(samples),
            "element_stats": {},
            "year_stats": {
                "mean": float(np.mean(years)),
                "std": float(np.std(years)),
                "min": int(np.min(years)),
                "max": int(np.max(years))
            }
        }

        for i, elem in enumerate(self.elements):
            stats["element_stats"][elem] = {
                "mean": float(np.mean(compositions[:, i])),
                "std": float(np.std(compositions[:, i])),
                "min": float(np.min(compositions[:, i])),
                "max": float(np.max(compositions[:, i]))
            }

        return stats


ml_model = CeramicAnalysisModel()
