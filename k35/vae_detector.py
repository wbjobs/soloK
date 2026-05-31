import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import logging
from sklearn.preprocessing import StandardScaler

from schemas import MeasurementData, AttackNode

logger = logging.getLogger(__name__)


@dataclass
class VAEDetectionResult:
    is_attack: bool
    elbo_score: float
    kl_divergence: float
    reconstruction_likelihood: float
    latent_density_score: float
    threshold: float
    confidence: float
    suspicious_nodes: List[AttackNode]
    node_density_scores: Dict[int, float]


class VAEEncoder(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, latent_dim: int):
        super(VAEEncoder, self).__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim // 2)
        self.fc_mu = nn.Linear(hidden_dim // 2, latent_dim)
        self.fc_logvar = nn.Linear(hidden_dim // 2, latent_dim)

    def forward(self, x) -> Tuple[torch.Tensor, torch.Tensor]:
        h = torch.relu(self.fc1(x))
        h = torch.relu(self.fc2(h))
        mu = self.fc_mu(h)
        logvar = self.fc_logvar(h)
        return mu, logvar


class VAEDecoder(nn.Module):
    def __init__(self, latent_dim: int, hidden_dim: int, output_dim: int):
        super(VAEDecoder, self).__init__()
        self.fc1 = nn.Linear(latent_dim, hidden_dim // 2)
        self.fc2 = nn.Linear(hidden_dim // 2, hidden_dim)
        self.fc3 = nn.Linear(hidden_dim, output_dim)

    def forward(self, z) -> torch.Tensor:
        h = torch.relu(self.fc1(z))
        h = torch.relu(self.fc2(h))
        return self.fc3(h)


class VariationalAutoencoder(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 64, latent_dim: int = 16):
        super(VariationalAutoencoder, self).__init__()
        self.encoder = VAEEncoder(input_dim, hidden_dim, latent_dim)
        self.decoder = VAEDecoder(latent_dim, hidden_dim, input_dim)

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def forward(self, x) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encoder(x)
        z = self.reparameterize(mu, logvar)
        x_reconstructed = self.decoder(z)
        return x_reconstructed, mu, logvar

    def encode_to_latent(self, x) -> Tuple[torch.Tensor, torch.Tensor]:
        mu, logvar = self.encoder(x)
        return mu, logvar


def vae_loss_function(x_reconstructed, x, mu, logvar, beta: float = 1.0):
    recon_loss = nn.functional.mse_loss(x_reconstructed, x, reduction='sum')
    kl_div = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp())
    return recon_loss + beta * kl_div, recon_loss, kl_div


class _LatentDensityEstimator:
    def __init__(self, alpha: float = 0.01, n_components: int = 5):
        self.alpha = alpha
        self.n_components = n_components
        self._means: List[np.ndarray] = []
        self._covs: List[np.ndarray] = []
        self._weights: List[float] = []
        self._n_samples = 0
        self._fitted = False

    def fit(self, latent_codes: np.ndarray):
        from sklearn.mixture import GaussianMixture
        
        n_samples = latent_codes.shape[0]
        if n_samples < 10:
            logger.warning("Too few samples for density estimation")
            return
        
        n_components = min(self.n_components, max(1, n_samples // 5))
        try:
            gmm = GaussianMixture(
                n_components=n_components,
                covariance_type='full',
                reg_covar=1e-6,
                max_iter=100
            )
            gmm.fit(latent_codes)
            self._gmm = gmm
            self._fitted = True
            self._n_samples = n_samples
            logger.info(f"Latent density estimator fitted with {n_components} components on {n_samples} samples")
        except Exception as e:
            logger.warning(f"GMM fitting failed: {e}, using fallback")
            self._fitted = False
            self._train_mean = np.mean(latent_codes, axis=0)
            self._train_cov = np.cov(latent_codes.T) + np.eye(latent_codes.shape[1]) * 1e-6
            self._n_samples = n_samples

    def score_samples(self, latent_codes: np.ndarray) -> np.ndarray:
        if not self._fitted:
            if hasattr(self, '_train_mean'):
                diff = latent_codes - self._train_mean
                try:
                    inv_cov = np.linalg.inv(self._train_cov)
                    mahal = np.sum(diff @ inv_cov * diff, axis=1)
                    return -mahal
                except np.linalg.LinAlgError:
                    return -np.sum(diff ** 2, axis=1)
            return np.zeros(latent_codes.shape[0])
        
        return self._gmm.score_samples(latent_codes)

    @property
    def is_fitted(self) -> bool:
        return self._fitted or hasattr(self, '_train_mean')


class VAEDetector:
    def __init__(self, input_dim: int = 4, hidden_dim: int = 64, latent_dim: int = 16,
                 beta: float = 1.0, density_threshold_percentile: float = 5.0,
                 device: str = "cpu"):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.latent_dim = latent_dim
        self.beta = beta
        self.density_threshold_percentile = density_threshold_percentile
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")

        self.model = VariationalAutoencoder(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            latent_dim=latent_dim
        ).to(self.device)

        self.scaler = StandardScaler()
        self.density_estimator = _LatentDensityEstimator()
        self.is_trained = False
        self.elbo_threshold = None
        self.density_threshold = None
        self.baseline_elbo = []
        self.baseline_density = []

        self.measurement_types = ['voltage_magnitude', 'voltage_angle',
                                  'active_power', 'reactive_power']

    def _preprocess_measurements(self, measurements: List[MeasurementData]) -> np.ndarray:
        features = np.zeros((len(measurements), self.input_dim))
        for i, m in enumerate(measurements):
            features[i] = [m.voltage_magnitude, m.voltage_angle,
                          m.active_power, m.reactive_power]
        return features

    def fit(self, data_history: List[List[MeasurementData]],
            epochs: int = 50, batch_size: int = 32, learning_rate: float = 1e-3):
        all_features = []
        for measurements in data_history:
            features = self._preprocess_measurements(measurements)
            all_features.append(features)

        all_features = np.vstack(all_features)
        self.scaler.fit(all_features)
        scaled = self.scaler.transform(all_features)

        X = torch.tensor(scaled, dtype=torch.float32).to(self.device)
        dataset = TensorDataset(X)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate)

        self.model.train()
        for epoch in range(epochs):
            total_loss = 0
            total_recon = 0
            total_kl = 0
            n_batches = 0
            for (batch_X,) in dataloader:
                optimizer.zero_grad()
                x_recon, mu, logvar = self.model(batch_X)
                loss, recon_loss, kl_loss = vae_loss_function(
                    x_recon, batch_X, mu, logvar, self.beta
                )
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
                total_recon += recon_loss.item()
                total_kl += kl_loss.item()
                n_batches += 1

            if (epoch + 1) % 10 == 0:
                logger.info(
                    f"VAE Epoch {epoch+1}/{epochs}, "
                    f"Loss: {total_loss/n_batches:.2f}, "
                    f"Recon: {total_recon/n_batches:.2f}, "
                    f"KL: {total_kl/n_batches:.2f}"
                )

        self.model.eval()
        with torch.no_grad():
            x_recon, mu, logvar = self.model(X)
            _, recon_losses, kl_losses = vae_loss_function(x_recon, X, mu, logvar, self.beta)

            per_sample_recon = nn.functional.mse_loss(x_recon, X, reduction='none').sum(dim=1)
            per_sample_kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1)
            per_sample_elbo = -(per_sample_recon + self.beta * per_sample_kl)

            elbo_np = per_sample_elbo.cpu().numpy()
            self.baseline_elbo = elbo_np.tolist()

            latent_codes = mu.cpu().numpy()
            self.density_estimator.fit(latent_codes)

            density_scores = self.density_estimator.score_samples(latent_codes)
            self.baseline_density = density_scores.tolist()

        mean_elbo = np.mean(self.baseline_elbo)
        std_elbo = np.std(self.baseline_elbo)
        self.elbo_threshold = mean_elbo - 2.0 * std_elbo

        if len(self.baseline_density) > 0:
            self.density_threshold = np.percentile(
                self.baseline_density, self.density_threshold_percentile
            )
        else:
            self.density_threshold = -1e6

        self.is_trained = True
        logger.info(
            f"VAE Training complete. ELBO threshold: {self.elbo_threshold:.2f}, "
            f"Density threshold: {self.density_threshold:.2f}"
        )

        return {
            'mean_elbo': float(mean_elbo),
            'std_elbo': float(std_elbo),
            'elbo_threshold': float(self.elbo_threshold),
            'density_threshold': float(self.density_threshold),
            'n_training_samples': len(self.baseline_elbo)
        }

    def detect(self, measurements: List[MeasurementData]) -> VAEDetectionResult:
        features = self._preprocess_measurements(measurements)
        n_nodes = features.shape[0]

        if not self.is_trained:
            logger.warning("VAE not trained, returning default result")
            return VAEDetectionResult(
                is_attack=False, elbo_score=0.0, kl_divergence=0.0,
                reconstruction_likelihood=0.0, latent_density_score=0.0,
                threshold=0.0, confidence=0.0, suspicious_nodes=[],
                node_density_scores={}
            )

        scaled = self.scaler.transform(features)
        X = torch.tensor(scaled, dtype=torch.float32).to(self.device)

        self.model.eval()
        with torch.no_grad():
            x_recon, mu, logvar = self.model(X)

            per_sample_recon = nn.functional.mse_loss(x_recon, X, reduction='none').sum(dim=1)
            per_sample_kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1)
            per_sample_elbo = -(per_sample_recon + self.beta * per_sample_kl)

            elbo_np = per_sample_elbo.cpu().numpy()
            kl_np = per_sample_kl.cpu().numpy()
            recon_np = -per_sample_recon.cpu().numpy()

            latent_codes = mu.cpu().numpy()
            density_scores = self.density_estimator.score_samples(latent_codes)

        avg_elbo = float(np.mean(elbo_np))
        avg_kl = float(np.mean(kl_np))
        avg_recon = float(np.mean(recon_np))
        avg_density = float(np.mean(density_scores))

        elbo_anomaly = avg_elbo < self.elbo_threshold if self.elbo_threshold else False
        density_anomaly = avg_density < self.density_threshold if self.density_threshold else False

        is_attack = elbo_anomaly or density_anomaly

        if is_attack:
            anomaly_factors = []
            if elbo_anomaly and self.elbo_threshold:
                ratio = abs(avg_elbo - self.elbo_threshold) / max(abs(self.elbo_threshold), 1e-10)
                anomaly_factors.append(min(1.0, 0.5 + 0.5 * ratio))
            if density_anomaly and self.density_threshold:
                ratio = abs(avg_density - self.density_threshold) / max(abs(self.density_threshold), 1e-10)
                anomaly_factors.append(min(1.0, 0.5 + 0.5 * ratio))
            confidence = max(anomaly_factors) if anomaly_factors else 0.6
        else:
            confidence = 0.3

        node_density_scores = {}
        for i, m in enumerate(measurements):
            node_density_scores[m.node_id] = float(density_scores[i])

        suspicious_nodes = self._locate_suspicious_nodes(
            density_scores, elbo_np, measurements
        )

        return VAEDetectionResult(
            is_attack=is_attack,
            elbo_score=avg_elbo,
            kl_divergence=avg_kl,
            reconstruction_likelihood=avg_recon,
            latent_density_score=avg_density,
            threshold=float(self.elbo_threshold) if self.elbo_threshold else 0.0,
            confidence=float(confidence),
            suspicious_nodes=suspicious_nodes,
            node_density_scores=node_density_scores
        )

    def _locate_suspicious_nodes(self, density_scores: np.ndarray,
                                  elbo_scores: np.ndarray,
                                  measurements: List[MeasurementData]) -> List[AttackNode]:
        suspicious_nodes = []

        if len(density_scores) == 0:
            return suspicious_nodes

        mean_density = np.mean(density_scores)
        std_density = np.std(density_scores) if len(density_scores) > 1 else 1.0
        mean_elbo = np.mean(elbo_scores)
        std_elbo = np.std(elbo_scores) if len(elbo_scores) > 1 else 1.0

        for i, m in enumerate(measurements):
            density_z = (density_scores[i] - mean_density) / max(abs(std_density), 1e-10)
            elbo_z = (elbo_scores[i] - mean_elbo) / max(abs(std_elbo), 1e-10)

            low_density = density_scores[i] < (mean_density - 2.0 * abs(std_density))
            low_elbo = elbo_scores[i] < (mean_elbo - 2.0 * abs(std_elbo))

            if low_density or low_elbo:
                density_suspicious = min(1.0, max(0.0, -density_z / 3.0 + 0.3))
                elbo_suspicious = min(1.0, max(0.0, -elbo_z / 3.0 + 0.3))
                suspicious_index = max(density_suspicious, elbo_suspicious)

                affected = []
                if suspicious_index > 0.5:
                    affected = self.measurement_types

                suspicious_nodes.append(AttackNode(
                    node_id=m.node_id,
                    suspicious_index=float(suspicious_index),
                    attack_type="latent_anomaly",
                    affected_measurements=affected
                ))

        suspicious_nodes.sort(key=lambda x: x.suspicious_index, reverse=True)
        return suspicious_nodes

    def incremental_update(self, new_measurements: List[List[MeasurementData]],
                           learning_rate: float = 1e-4, epochs: int = 5):
        if not self.is_trained:
            logger.warning("VAE not trained, performing full training instead")
            return self.fit(new_measurements, epochs=20)

        all_features = []
        for measurements in new_measurements:
            features = self._preprocess_measurements(measurements)
            all_features.append(features)

        all_features = np.vstack(all_features)
        scaled = self.scaler.transform(all_features)
        X = torch.tensor(scaled, dtype=torch.float32).to(self.device)

        dataset = TensorDataset(X)
        dataloader = DataLoader(dataset, batch_size=8, shuffle=True)

        optimizer = torch.optim.SGD(self.model.parameters(), lr=learning_rate, momentum=0.9)

        self.model.train()
        for epoch in range(epochs):
            total_loss = 0
            n_batches = 0
            for (batch_X,) in dataloader:
                optimizer.zero_grad()
                x_recon, mu, logvar = self.model(batch_X)
                loss, _, _ = vae_loss_function(x_recon, batch_X, mu, logvar, self.beta)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
                n_batches += 1
            logger.info(f"VAE Incremental Epoch {epoch+1}/{epochs}, Loss: {total_loss/n_batches:.2f}")

        self.model.eval()
        with torch.no_grad():
            x_recon, mu, logvar = self.model(X)
            per_sample_recon = nn.functional.mse_loss(x_recon, X, reduction='none').sum(dim=1)
            per_sample_kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1)
            per_sample_elbo = -(per_sample_recon + self.beta * per_sample_kl)

            self.baseline_elbo.extend(per_sample_elbo.cpu().numpy().tolist())
            if len(self.baseline_elbo) > 2000:
                self.baseline_elbo = self.baseline_elbo[-2000:]

            latent_codes = mu.cpu().numpy()
            all_historical = np.vstack([self.density_estimator._gmm.means_ if self.density_estimator._fitted else latent_codes, latent_codes])
            self.density_estimator.fit(all_historical[-500:])

            density_scores = self.density_estimator.score_samples(latent_codes)
            self.baseline_density.extend(density_scores.tolist())
            if len(self.baseline_density) > 2000:
                self.baseline_density = self.baseline_density[-2000:]

        mean_elbo = np.mean(self.baseline_elbo)
        std_elbo = np.std(self.baseline_elbo)
        self.elbo_threshold = mean_elbo - 2.0 * std_elbo

        if len(self.baseline_density) > 0:
            self.density_threshold = np.percentile(
                self.baseline_density, self.density_threshold_percentile
            )

        return {
            'mean_elbo': float(mean_elbo),
            'std_elbo': float(std_elbo),
            'elbo_threshold': float(self.elbo_threshold),
            'density_threshold': float(self.density_threshold)
        }

    def save_model(self, path: str):
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'scaler': self.scaler,
            'elbo_threshold': self.elbo_threshold,
            'density_threshold': self.density_threshold,
            'baseline_elbo': self.baseline_elbo,
            'baseline_density': self.baseline_density,
            'is_trained': self.is_trained,
            'input_dim': self.input_dim,
            'hidden_dim': self.hidden_dim,
            'latent_dim': self.latent_dim,
            'beta': self.beta,
            'density_threshold_percentile': self.density_threshold_percentile
        }, path)
        logger.info(f"VAE Model saved to {path}")

    def load_model(self, path: str):
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.scaler = checkpoint['scaler']
        self.elbo_threshold = checkpoint['elbo_threshold']
        self.density_threshold = checkpoint['density_threshold']
        self.baseline_elbo = checkpoint['baseline_elbo']
        self.baseline_density = checkpoint['baseline_density']
        self.is_trained = checkpoint['is_trained']
        self.input_dim = checkpoint.get('input_dim', self.input_dim)
        self.hidden_dim = checkpoint.get('hidden_dim', self.hidden_dim)
        self.latent_dim = checkpoint.get('latent_dim', self.latent_dim)
        self.beta = checkpoint.get('beta', self.beta)
        self.density_threshold_percentile = checkpoint.get(
            'density_threshold_percentile', self.density_threshold_percentile
        )
        logger.info(f"VAE Model loaded from {path}")
