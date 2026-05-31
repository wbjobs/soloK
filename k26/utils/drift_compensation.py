import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import LabelEncoder
import torch
import torch.nn as nn
import torch.optim as optim
from config import CLASSIFIER_CONFIG

class DriftCompensator:
    def __init__(self, n_components=None):
        if n_components is None:
            n_components = CLASSIFIER_CONFIG['pca_components']
        self.n_components = n_components
        self.scaler = StandardScaler()
        self.pca = PCA(n_components=n_components)
        self.reference_data = None
        self.is_fitted = False

    def fit(self, X):
        X_scaled = self.scaler.fit_transform(X)
        self.pca.fit(X_scaled)
        self.reference_data = X_scaled
        self.is_fitted = True
        return self

    def transform(self, X):
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")
        
        X_scaled = self.scaler.transform(X)
        return self.pca.transform(X_scaled)

    def fit_transform(self, X):
        return self.fit(X).transform(X)

    def inverse_transform(self, X_pca):
        return self.pca.inverse_transform(X_pca)

    def compensate_drift(self, X_new, X_ref=None):
        if X_ref is not None:
            self.fit(X_ref)
        
        X_new_pca = self.transform(X_new)
        X_compensated = self.inverse_transform(X_new_pca)
        
        return X_compensated


class BatchEffectRemover:
    def __init__(self, method='pca_alignment'):
        self.method = method
        self.scaler = StandardScaler()
        self.batch_means = {}
        self.batch_stds = {}
        self.reference_batch = None
        self.alignment_matrices = {}

    def fit(self, X, batch_labels, reference_batch=None):
        if reference_batch is None:
            unique_batches = np.unique(batch_labels)
            reference_batch = unique_batches[0]
        
        self.reference_batch = reference_batch
        X_scaled = self.scaler.fit_transform(X)
        
        for batch in np.unique(batch_labels):
            batch_mask = batch_labels == batch
            X_batch = X_scaled[batch_mask]
            self.batch_means[batch] = np.mean(X_batch, axis=0)
            self.batch_stds[batch] = np.std(X_batch, axis=0)
        
        return self

    def transform(self, X, batch_labels):
        X_scaled = self.scaler.transform(X)
        X_corrected = np.zeros_like(X_scaled)
        
        ref_mean = self.batch_means[self.reference_batch]
        ref_std = self.batch_stds[self.reference_batch]
        
        for batch in np.unique(batch_labels):
            batch_mask = np.array([b == batch for b in batch_labels])
            if np.any(batch_mask):
                batch_mean = self.batch_means.get(batch, ref_mean)
                batch_std = self.batch_stds.get(batch, ref_std)
                
                X_batch = X_scaled[batch_mask]
                batch_std_safe = np.where(batch_std == 0, 1, batch_std)
                ref_std_safe = np.where(ref_std == 0, 1, ref_std)
                
                X_normalized = (X_batch - batch_mean) / batch_std_safe
                X_corrected[batch_mask] = X_normalized * ref_std_safe + ref_mean
        
        return X_corrected

    def fit_transform(self, X, batch_labels, reference_batch=None):
        return self.fit(X, batch_labels, reference_batch).transform(X, batch_labels)


class DomainAdversarialNN(nn.Module):
    def __init__(self, input_dim, hidden_dim=128, latent_dim=64):
        super(DomainAdversarialNN, self).__init__()
        
        self.feature_extractor = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, latent_dim)
        )
        
        self.classifier = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1)
        )
        
        self.domain_discriminator = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1)
        )
        
    def forward(self, x, alpha=1.0):
        features = self.feature_extractor(x)
        class_output = self.classifier(features)
        domain_output = self.domain_discriminator(features)
        return class_output, domain_output, features


class DomainAdaptation:
    def __init__(self, method='coral'):
        self.method = method
        self.scaler = StandardScaler()
        self.source_mean = None
        self.target_mean = None
        self.source_cov = None
        self.target_cov = None

    def fit(self, X_source, X_target=None):
        X_source_scaled = self.scaler.fit_transform(X_source)
        self.source_mean = np.mean(X_source_scaled, axis=0)
        
        if X_target is not None:
            X_target_scaled = self.scaler.transform(X_target)
            self.target_mean = np.mean(X_target_scaled, axis=0)
            
            if self.method == 'coral':
                self.source_cov = np.cov(X_source_scaled, rowvar=False) + 1e-5 * np.eye(X_source_scaled.shape[1])
                self.target_cov = np.cov(X_target_scaled, rowvar=False) + 1e-5 * np.eye(X_target_scaled.shape[1])
        
        return self

    def transform(self, X, method=None):
        if method is None:
            method = self.method
        
        X_scaled = self.scaler.transform(X)
        
        if method == 'mean_alignment':
            return self._mean_alignment(X_scaled)
        elif method == 'coral':
            return self._coral_transform(X_scaled)
        else:
            return X_scaled

    def _mean_alignment(self, X):
        if self.target_mean is None:
            return X
        return X - self.source_mean + self.target_mean

    def _coral_transform(self, X):
        if self.target_cov is None:
            return X
        
        source_cov_sqrt = np.linalg.cholesky(self.source_cov)
        source_cov_inv_sqrt = np.linalg.inv(source_cov_sqrt)
        target_cov_sqrt = np.linalg.cholesky(self.target_cov)
        
        transformation = source_cov_inv_sqrt @ target_cov_sqrt
        X_aligned = X @ transformation
        
        return X_aligned

    def fit_transform(self, X_source, X_target=None):
        return self.fit(X_source, X_target).transform(X_source)


class DriftDetection:
    def __init__(self, window_size=50, threshold=3.0):
        self.window_size = window_size
        self.threshold = threshold
        self.reference_stats = None

    def set_reference(self, X):
        self.reference_stats = {
            'mean': np.mean(X, axis=0),
            'std': np.std(X, axis=0),
            'max': np.max(X, axis=0),
            'min': np.min(X, axis=0)
        }

    def detect(self, X):
        if self.reference_stats is None:
            raise ValueError("Reference stats not set. Call set_reference() first.")
        
        current_mean = np.mean(X, axis=0)
        drift_scores = np.abs(current_mean - self.reference_stats['mean']) / (self.reference_stats['std'] + 1e-10)
        
        drifted_features = np.where(drift_scores > self.threshold)[0]
        drift_detected = len(drifted_features) > 0
        
        return {
            'drift_detected': drift_detected,
            'drift_scores': drift_scores,
            'drifted_features': drifted_features,
            'max_drift_score': np.max(drift_scores)
        }

    def monitor_drift(self, X_stream):
        drift_history = []
        for i in range(0, len(X_stream), self.window_size):
            window = X_stream[i:i+self.window_size]
            if len(window) >= self.window_size // 2:
                result = self.detect(window)
                result['window_index'] = i
                drift_history.append(result)
        return drift_history
