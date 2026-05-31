import numpy as np
from typing import List, Dict, Any, Tuple
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from scipy.stats import multivariate_normal
import joblib
import os
from config import settings
from database import SessionLocal, KilnSample
from preprocessing import preprocessor


class GMMMixtureDetector:
    def __init__(self):
        self.elements = settings.ELEMENTS
        self.rare_earth_elements = settings.RARE_EARTH_ELEMENTS
        self.all_elements = settings.ALL_ELEMENTS
        self.model_dir = "models"
        os.makedirs(self.model_dir, exist_ok=True)

        self.individual_kiln_gmms = {}
        self.scaler = None
        self.isc_trained = False

        self._load_or_train_models()

    def _load_training_data(self) -> Tuple[Dict[str, np.ndarray], np.ndarray, np.ndarray]:
        db = SessionLocal()
        samples = db.query(KilnSample).all()
        db.close()

        if not samples:
            raise Exception("No training data found in database")

        kiln_data = {}
        all_X = []
        all_y = []

        for sample in samples:
            composition = []
            for elem in self.all_elements:
                val = getattr(sample, elem, np.nan)
                composition.append(val if not np.isnan(val) else 0.0)

            if sample.kiln_id not in kiln_data:
                kiln_data[sample.kiln_id] = []
            kiln_data[sample.kiln_id].append(composition)
            all_X.append(composition)
            all_y.append(sample.kiln_id)

        for k in kiln_data:
            kiln_data[k] = np.array(kiln_data[k])

        return kiln_data, np.array(all_X), np.array(all_y)

    def _train_models(self):
        kiln_data, all_X, _ = self._load_training_data()

        self.scaler = StandardScaler()
        self.scaler.fit(all_X)

        for kiln_id, X_kiln in kiln_data.items():
            X_scaled = self.scaler.transform(X_kiln)

            n_components = min(3, max(1, len(X_kiln) // 15))
            gmm = GaussianMixture(
                n_components=n_components,
                covariance_type='full',
                reg_covar=1e-4,
                max_iter=200,
                random_state=42
            )
            gmm.fit(X_scaled)
            self.individual_kiln_gmms[kiln_id] = gmm

        self._save_models()
        self.isc_trained = True

    def _save_models(self):
        joblib.dump(self.individual_kiln_gmms, os.path.join(self.model_dir, "kiln_gmms.pkl"))
        joblib.dump(self.scaler, os.path.join(self.model_dir, "gmm_scaler.pkl"))

    def _load_or_train_models(self):
        model_files = ["kiln_gmms.pkl", "gmm_scaler.pkl"]
        all_exist = all(os.path.exists(os.path.join(self.model_dir, f)) for f in model_files)

        if all_exist:
            try:
                self.individual_kiln_gmms = joblib.load(os.path.join(self.model_dir, "kiln_gmms.pkl"))
                self.scaler = joblib.load(os.path.join(self.model_dir, "gmm_scaler.pkl"))
                self.isc_trained = True
                return
            except Exception:
                pass

        try:
            self._train_models()
        except Exception as e:
            print(f"Warning: Could not train GMM models: {e}")

    def _composition_to_array(self, composition: Dict[str, float]) -> np.ndarray:
        values = []
        for elem in self.all_elements:
            val = composition.get(elem, 0.0)
            values.append(val if val is not None else 0.0)
        return np.array([values])

    def detect_mixture(self, composition: Dict[str, float], top_n: int = 3) -> Dict[str, Any]:
        X = self._composition_to_array(composition)
        X_scaled = self.scaler.transform(X)

        log_likelihoods = {}
        for kiln_id, gmm in self.individual_kiln_gmms.items():
            ll = gmm.score_samples(X_scaled)[0]
            log_likelihoods[kiln_id] = ll

        max_ll = max(log_likelihoods.values())
        likelihoods = {}
        for k, ll in log_likelihoods.items():
            likelihoods[k] = np.exp(ll - max_ll)

        total = sum(likelihoods.values())
        probabilities = {k: v / total for k, v in likelihoods.items()}

        sorted_kilns = sorted(probabilities.items(), key=lambda x: x[1], reverse=True)
        top_kilns = sorted_kilns[:top_n]

        best_ll = log_likelihoods[sorted_kilns[0][0]]
        single_gmm = self.individual_kiln_gmms[sorted_kilns[0][0]]
        sample_ll = single_gmm.score_samples(X_scaled)[0]
        mean_ll = np.mean([gmm.score_samples(X_scaled)[0] for gmm in self.individual_kiln_gmms.values()])

        z_score = (sample_ll - mean_ll) / np.std([gmm.score_samples(X_scaled)[0] for gmm in self.individual_kiln_gmms.values()])

        mixture_score = 0.0
        contributing_kilns = []

        if len(sorted_kilns) >= 2:
            p1 = sorted_kilns[0][1]
            p2 = sorted_kilns[1][1]
            ratio = p2 / p1 if p1 > 0 else 0
            mixture_score = min(1.0, ratio * 2.5)

            for kiln_id, prob in sorted_kilns[:5]:
                if prob > 0.1:
                    contributing_kilns.append({
                        "kiln_id": kiln_id,
                        "kiln_name": settings.KILN_NAMES.get(kiln_id, kiln_id),
                        "probability": float(prob),
                        "log_likelihood": float(log_likelihoods[kiln_id])
                    })

        is_mixture = mixture_score > 0.3

        result = {
            "is_mixture": is_mixture,
            "mixture_score": float(mixture_score),
            "anomaly_score": float(abs(z_score)),
            "top_kilns": [
                {
                    "kiln_id": k,
                    "kiln_name": settings.KILN_NAMES.get(k, k),
                    "probability": float(p),
                    "log_likelihood": float(log_likelihoods[k])
                }
                for k, p in top_kilns
            ],
            "contributing_kilns": contributing_kilns,
            "analysis": self._generate_mixture_analysis(mixture_score, contributing_kilns, z_score)
        }

        return result

    def _generate_mixture_analysis(self, mixture_score: float, contributing_kilns: List[Dict], z_score: float) -> List[str]:
        analysis = []

        if mixture_score < 0.2:
            analysis.append("样本成分与单一窑口特征高度一致，无明显混合迹象")
        elif mixture_score < 0.4:
            analysis.append("样本成分存在弱混合特征，可能是窑口间技术交流或原料波动导致")
        elif mixture_score < 0.7:
            analysis.append("样本成分存在明显混合特征，可能来自多个窑口的原料或工艺混合")
        else:
            analysis.append("样本成分混合特征强烈，高度怀疑是多窑口工艺混合或后仿制品")

        if len(contributing_kilns) >= 2:
            k1 = contributing_kilns[0]
            k2 = contributing_kilns[1]
            analysis.append(f"主要成分来源: {k1['kiln_name']} ({k1['probability']:.1%})")
            analysis.append(f"次要成分来源: {k2['kiln_name']} ({k2['probability']:.1%})")
            analysis.append(f"推测可能为: {k1['kiln_name']}胎体 + {k2['kiln_name']}釉料 混合工艺")

        if abs(z_score) > 2.5:
            analysis.append("注意: 样本成分偏离已知窑口特征较远，可能是未记录的窑口或现代仿品")

        return analysis

    def batch_detect_mixture(self, compositions: List[Dict[str, float]]) -> List[Dict[str, Any]]:
        return [self.detect_mixture(comp) for comp in compositions]


gmm_detector = GMMMixtureDetector()
