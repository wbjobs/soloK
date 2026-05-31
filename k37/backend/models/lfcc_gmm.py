import numpy as np
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
import joblib
import os
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "pretrained"
MODEL_DIR.mkdir(exist_ok=True)

class LFCCGMMDetector:
    def __init__(self):
        self.real_gmm = None
        self.fake_gmm = None
        self.scaler = None
        self._init_models()
    
    def _init_models(self):
        real_model_path = MODEL_DIR / "real_gmm.pkl"
        fake_model_path = MODEL_DIR / "fake_gmm.pkl"
        scaler_path = MODEL_DIR / "scaler.pkl"
        
        if real_model_path.exists() and fake_model_path.exists() and scaler_path.exists():
            self.real_gmm = joblib.load(real_model_path)
            self.fake_gmm = joblib.load(fake_model_path)
            self.scaler = joblib.load(scaler_path)
        else:
            self.real_gmm = GaussianMixture(n_components=64, covariance_type='diag', random_state=42)
            self.fake_gmm = GaussianMixture(n_components=64, covariance_type='diag', random_state=42)
            self.scaler = StandardScaler()
            self._create_dummy_models()
    
    def _create_dummy_models(self):
        np.random.seed(42)
        n_samples = 1000
        n_features = 60
        
        real_data = np.random.randn(n_samples, n_features)
        fake_data = np.random.randn(n_samples, n_features) + 0.5
        
        all_data = np.vstack([real_data, fake_data])
        self.scaler.fit(all_data)
        
        real_scaled = self.scaler.transform(real_data)
        fake_scaled = self.scaler.transform(fake_data)
        
        self.real_gmm.fit(real_scaled)
        self.fake_gmm.fit(fake_scaled)
        
        joblib.dump(self.real_gmm, MODEL_DIR / "real_gmm.pkl")
        joblib.dump(self.fake_gmm, MODEL_DIR / "fake_gmm.pkl")
        joblib.dump(self.scaler, MODEL_DIR / "scaler.pkl")
    
    def extract_features(self, lfcc_features):
        features = lfcc_features.T
        return features
    
    def predict(self, lfcc_features):
        features = self.extract_features(lfcc_features)
        features_scaled = self.scaler.transform(features)
        
        real_scores = self.real_gmm.score_samples(features_scaled)
        fake_scores = self.fake_gmm.score_samples(features_scaled)
        
        frame_scores = fake_scores - real_scores
        
        mean_score = np.mean(frame_scores)
        fake_prob = 1 / (1 + np.exp(-mean_score / 10))
        
        return fake_prob, frame_scores

def create_pretrained_gmm_models():
    detector = LFCCGMMDetector()
    return detector
