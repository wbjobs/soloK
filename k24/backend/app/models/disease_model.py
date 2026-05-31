import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, List, Optional
import numpy as np
from scipy.interpolate import interp1d


class AdaptiveSpectralCNN(nn.Module):
    def __init__(
        self,
        fixed_input_channels: int = 150,
        num_classes: int = 5,
        dropout_rate: float = 0.3
    ):
        super(AdaptiveSpectralCNN, self).__init__()
        
        self.fixed_input_channels = fixed_input_channels
        
        self.conv1 = nn.Conv1d(1, 32, kernel_size=5, stride=1, padding=2)
        self.bn1 = nn.BatchNorm1d(32)
        self.pool1 = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.conv2 = nn.Conv1d(32, 64, kernel_size=5, stride=1, padding=2)
        self.bn2 = nn.BatchNorm1d(64)
        self.pool2 = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.conv3 = nn.Conv1d(64, 128, kernel_size=3, stride=1, padding=1)
        self.bn3 = nn.BatchNorm1d(128)
        self.pool3 = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.conv4 = nn.Conv1d(128, 256, kernel_size=3, stride=1, padding=1)
        self.bn4 = nn.BatchNorm1d(256)
        self.pool4 = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.dropout = nn.Dropout(dropout_rate)
        
        conv_output_size = fixed_input_channels
        for _ in range(4):
            conv_output_size = conv_output_size // 2
        
        self.fc1 = nn.Linear(256 * conv_output_size, 512)
        self.fc2 = nn.Linear(512, 128)
        self.fc_class = nn.Linear(128, num_classes)
        
        self.gradients = None
        self.activations = None

    def activations_hook(self, grad):
        self.gradients = grad

    def resample_spectrum(self, x: torch.Tensor, src_length: int) -> torch.Tensor:
        if src_length == self.fixed_input_channels:
            return x
        
        x_np = x.cpu().numpy()
        src_points = np.linspace(0, 1, src_length)
        dst_points = np.linspace(0, 1, self.fixed_input_channels)
        
        resampled = []
        for spectrum in x_np:
            f = interp1d(src_points, spectrum, kind='linear', fill_value='extrapolate')
            resampled.append(f(dst_points))
        
        return torch.FloatTensor(np.array(resampled)).to(x.device)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.size(1) != self.fixed_input_channels:
            x = self.resample_spectrum(x, x.size(1))
        
        x = x.unsqueeze(1)
        
        x = self.pool1(F.relu(self.bn1(self.conv1(x))))
        x = self.pool2(F.relu(self.bn2(self.conv2(x))))
        x = self.pool3(F.relu(self.bn3(self.conv3(x))))
        
        x = self.conv4(x)
        self.activations = x
        if x.requires_grad:
            x.register_hook(self.activations_hook)
        
        x = self.pool4(F.relu(self.bn4(x)))
        
        x = x.view(x.size(0), -1)
        x = self.dropout(F.relu(self.fc1(x)))
        x = self.dropout(F.relu(self.fc2(x)))
        
        return self.fc_class(x)

    def get_activations_gradient(self) -> torch.Tensor:
        return self.gradients

    def get_activations(self) -> torch.Tensor:
        return self.activations


class AdaptiveSeverityRegressor(nn.Module):
    def __init__(
        self,
        fixed_input_channels: int = 150,
        dropout_rate: float = 0.3
    ):
        super(AdaptiveSeverityRegressor, self).__init__()
        
        self.fixed_input_channels = fixed_input_channels
        
        self.conv1 = nn.Conv1d(1, 32, kernel_size=5, stride=1, padding=2)
        self.bn1 = nn.BatchNorm1d(32)
        self.pool1 = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.conv2 = nn.Conv1d(32, 64, kernel_size=5, stride=1, padding=2)
        self.bn2 = nn.BatchNorm1d(64)
        self.pool2 = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.conv3 = nn.Conv1d(64, 128, kernel_size=3, stride=1, padding=1)
        self.bn3 = nn.BatchNorm1d(128)
        self.pool3 = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.dropout = nn.Dropout(dropout_rate)
        
        conv_output_size = fixed_input_channels
        for _ in range(3):
            conv_output_size = conv_output_size // 2
        
        self.fc1 = nn.Linear(128 * conv_output_size, 256)
        self.fc2 = nn.Linear(256, 64)
        self.fc_reg = nn.Linear(64, 1)

    def resample_spectrum(self, x: torch.Tensor, src_length: int) -> torch.Tensor:
        if src_length == self.fixed_input_channels:
            return x
        
        x_np = x.cpu().numpy()
        src_points = np.linspace(0, 1, src_length)
        dst_points = np.linspace(0, 1, self.fixed_input_channels)
        
        resampled = []
        for spectrum in x_np:
            f = interp1d(src_points, spectrum, kind='linear', fill_value='extrapolate')
            resampled.append(f(dst_points))
        
        return torch.FloatTensor(np.array(resampled)).to(x.device)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.size(1) != self.fixed_input_channels:
            x = self.resample_spectrum(x, x.size(1))
        
        x = x.unsqueeze(1)
        
        x = self.pool1(F.relu(self.bn1(self.conv1(x))))
        x = self.pool2(F.relu(self.bn2(self.conv2(x))))
        x = self.pool3(F.relu(self.bn3(self.conv3(x))))
        
        x = x.view(x.size(0), -1)
        x = self.dropout(F.relu(self.fc1(x)))
        x = self.dropout(F.relu(self.fc2(x)))
        
        return torch.sigmoid(self.fc_reg(x)) * 5


class DiseaseClassifier:
    def __init__(
        self,
        fixed_num_bands: int = 150,
        num_classes: int = 5,
        device: str = 'cpu',
        class_names: List[str] = None
    ):
        self.device = torch.device(device)
        self.fixed_num_bands = fixed_num_bands
        
        self.class_names = class_names or [
            '健康',
            '条锈病',
            '叶锈病',
            '白粉病',
            '赤霉病'
        ]
        
        self.classifier = AdaptiveSpectralCNN(
            fixed_input_channels=fixed_num_bands,
            num_classes=num_classes
        ).to(self.device)
        
        self.severity_regressor = AdaptiveSeverityRegressor(
            fixed_input_channels=fixed_num_bands
        ).to(self.device)

    def load_weights(self, classifier_path: str, regressor_path: str):
        self.classifier.load_state_dict(torch.load(classifier_path, map_location=self.device))
        self.severity_regressor.load_state_dict(torch.load(regressor_path, map_location=self.device))

    def predict(
        self,
        spectra: np.ndarray,
        return_severity: bool = True
    ) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
        self.classifier.eval()
        if return_severity:
            self.severity_regressor.eval()
        
        if spectra.ndim == 1:
            spectra = spectra.reshape(1, -1)
        
        spectra = torch.FloatTensor(spectra).to(self.device)
        
        with torch.no_grad():
            outputs = self.classifier(spectra)
            probabilities = F.softmax(outputs, dim=1)
            predictions = torch.argmax(probabilities, dim=1)
            
            severity = None
            if return_severity:
                severity = self.severity_regressor(spectra)
                severity = severity.cpu().numpy().flatten()
                severity = np.clip(np.round(severity), 1, 5)
        
        return (
            predictions.cpu().numpy(),
            probabilities.cpu().numpy(),
            severity
        )

    def predict_hypercube(
        self,
        hypercube: np.ndarray,
        batch_size: int = 256
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        height, width, bands = hypercube.shape
        spectra = hypercube.reshape(-1, bands)
        
        num_samples = spectra.shape[0]
        all_predictions = []
        all_probabilities = []
        all_severity = []
        
        for i in range(0, num_samples, batch_size):
            batch = spectra[i:i+batch_size]
            pred, prob, sev = self.predict(batch)
            all_predictions.append(pred)
            all_probabilities.append(prob)
            all_severity.append(sev)
        
        predictions = np.concatenate(all_predictions).reshape(height, width)
        probabilities = np.concatenate(all_probabilities).reshape(height, width, -1)
        severity = np.concatenate(all_severity).reshape(height, width)
        
        return predictions, probabilities, severity
