import torch
import torch.nn.functional as F
import numpy as np
from typing import Tuple, List, Optional
from ..models.disease_model import SpectralCNN, DiseaseClassifier


class GradCAM:
    def __init__(self, model: SpectralCNN, target_layer: str = 'conv4'):
        self.model = model
        self.target_layer = target_layer
        self.gradients = None
        self.activations = None
        
        self._register_hooks()

    def _register_hooks(self):
        def forward_hook(module, input, output):
            self.activations = output.detach()

        def backward_hook(module, grad_input, grad_output):
            self.gradients = grad_output[0].detach()

        for name, module in self.model.named_modules():
            if name == self.target_layer:
                module.register_forward_hook(forward_hook)
                module.register_backward_hook(backward_hook)
                break

    def generate_cam(
        self,
        input_spectrum: torch.Tensor,
        target_class: Optional[int] = None
    ) -> np.ndarray:
        self.model.eval()
        
        if input_spectrum.ndim == 1:
            input_spectrum = input_spectrum.unsqueeze(0)
        
        input_spectrum = input_spectrum.unsqueeze(1)
        input_spectrum.requires_grad = True
        
        output = self.model(input_spectrum.squeeze(1))
        
        if target_class is None:
            target_class = torch.argmax(output, dim=1).item()
        
        self.model.zero_grad()
        
        target = output[0, target_class]
        target.backward(retain_graph=True)
        
        weights = torch.mean(self.gradients, dim=2, keepdim=True)
        
        cam = torch.sum(weights * self.activations, dim=1)
        cam = F.relu(cam)
        
        cam = cam.squeeze().cpu().numpy()
        
        cam_min = cam.min()
        cam_max = cam.max()
        if cam_max - cam_min > 1e-8:
            cam = (cam - cam_min) / (cam_max - cam_min)
        else:
            cam = np.zeros_like(cam)
        
        return cam

    def upsample_cam(self, cam: np.ndarray, target_length: int) -> np.ndarray:
        from scipy.interpolate import interp1d
        
        x_old = np.linspace(0, 1, len(cam))
        x_new = np.linspace(0, 1, target_length)
        
        f = interp1d(x_old, cam, kind='linear', fill_value='extrapolate')
        cam_upsampled = f(x_new)
        
        cam_min = cam_upsampled.min()
        cam_max = cam_upsampled.max()
        if cam_max - cam_min > 1e-8:
            cam_upsampled = (cam_upsampled - cam_min) / (cam_max - cam_min)
        
        return cam_upsampled


class SpectralGradCAMAnalyzer:
    def __init__(self, classifier: DiseaseClassifier):
        self.classifier = classifier
        self.grad_cam = GradCAM(classifier.classifier)

    def analyze_spectrum(
        self,
        spectrum: np.ndarray,
        target_class: Optional[int] = None,
        wavelengths: Optional[np.ndarray] = None
    ) -> dict:
        spectrum_tensor = torch.FloatTensor(spectrum).to(self.classifier.device)
        
        self.classifier.classifier.eval()
        with torch.no_grad():
            output = self.classifier.classifier(spectrum_tensor.unsqueeze(0))
            probabilities = F.softmax(output, dim=1)
            predicted_class = torch.argmax(probabilities, dim=1).item()
        
        if target_class is None:
            target_class = predicted_class
        
        cam = self.grad_cam.generate_cam(spectrum_tensor, target_class)
        cam_upsampled = self.grad_cam.upsample_cam(cam, len(spectrum))
        
        top_band_indices = np.argsort(cam_upsampled)[-10:][::-1]
        top_band_importance = cam_upsampled[top_band_indices]
        
        if wavelengths is not None:
            top_band_wavelengths = wavelengths[top_band_indices]
        else:
            top_band_wavelengths = top_band_indices
        
        result = {
            'predicted_class': predicted_class,
            'target_class': target_class,
            'class_name': self.classifier.class_names[target_class],
            'probability': float(probabilities[0, target_class]),
            'cam': cam.tolist(),
            'cam_upsampled': cam_upsampled.tolist(),
            'top_bands': [
                {
                    'index': int(idx),
                    'wavelength': float(wl) if wavelengths is not None else int(idx),
                    'importance': float(imp)
                }
                for idx, wl, imp in zip(top_band_indices, top_band_wavelengths, top_band_importance)
            ],
            'most_important_band': {
                'index': int(top_band_indices[0]),
                'wavelength': float(top_band_wavelengths[0]) if wavelengths is not None else int(top_band_indices[0]),
                'importance': float(top_band_importance[0])
            }
        }
        
        return result

    def analyze_hypercube(
        self,
        hypercube: np.ndarray,
        predictions: np.ndarray,
        wavelengths: Optional[np.ndarray] = None,
        sample_size: int = 100
    ) -> dict:
        height, width, bands = hypercube.shape
        
        unique_classes = np.unique(predictions)
        class_cam_analysis = {}
        
        for class_idx in unique_classes:
            class_mask = predictions == class_idx
            class_pixels = hypercube[class_mask]
            
            if len(class_pixels) > sample_size:
                indices = np.random.choice(len(class_pixels), sample_size, replace=False)
                class_pixels = class_pixels[indices]
            
            if len(class_pixels) == 0:
                continue
            
            cams = []
            for spectrum in class_pixels:
                cam = self.analyze_spectrum(spectrum, target_class=int(class_idx), wavelengths=wavelengths)
                cams.append(np.array(cam['cam_upsampled']))
            
            mean_cam = np.mean(cams, axis=0)
            std_cam = np.std(cams, axis=0)
            
            top_band_indices = np.argsort(mean_cam)[-10:][::-1]
            top_band_importance = mean_cam[top_band_indices]
            
            if wavelengths is not None:
                top_band_wavelengths = wavelengths[top_band_indices]
            else:
                top_band_wavelengths = top_band_indices
            
            class_cam_analysis[int(class_idx)] = {
                'class_name': self.classifier.class_names[class_idx],
                'mean_cam': mean_cam.tolist(),
                'std_cam': std_cam.tolist(),
                'top_bands': [
                    {
                        'index': int(idx),
                        'wavelength': float(wl) if wavelengths is not None else int(idx),
                        'importance': float(imp)
                    }
                    for idx, wl, imp in zip(top_band_indices, top_band_wavelengths, top_band_importance)
                ],
                'sample_count': len(class_pixels)
            }
        
        return {
            'class_analysis': class_cam_analysis,
            'wavelengths': wavelengths.tolist() if wavelengths is not None else None
        }
