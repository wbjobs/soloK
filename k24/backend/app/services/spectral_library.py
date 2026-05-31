import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from scipy.spatial.distance import cosine, euclidean
from scipy.stats import pearsonr
from .spectral_preprocessing import SpectralPreprocessor


class SpectralLibrary:
    def __init__(self, wavelengths: Optional[np.ndarray] = None):
        self.wavelengths = wavelengths
        self.library: List[Dict] = []
        self.preprocessor = SpectralPreprocessor(wavelengths)
        
        self._initialize_default_library()

    def _initialize_default_library(self):
        if self.wavelengths is None:
            self.wavelengths = np.linspace(400, 1000, 150)
        
        default_spectra = self._generate_default_spectra()
        
        for disease_name, spectrum_data in default_spectra.items():
            self.add_spectrum(
                spectrum=spectrum_data['spectrum'],
                disease_name=disease_name,
                severity=spectrum_data.get('severity', 1),
                crop_type=spectrum_data.get('crop_type', '小麦'),
                description=spectrum_data.get('description', '')
            )

    def _generate_default_spectra(self) -> Dict:
        wl = self.wavelengths
        
        spectra = {}
        
        healthy_red_edge = 720 + np.random.normal(0, 5)
        healthy_spectrum = np.zeros_like(wl)
        healthy_spectrum[wl < 680] = 0.05 + 0.02 * np.sin(wl[wl < 680] / 50)
        healthy_spectrum[(wl >= 680) & (wl < healthy_red_edge)] = np.interp(
            wl[(wl >= 680) & (wl < healthy_red_edge)],
            [680, healthy_red_edge],
            [0.05, 0.4]
        )
        healthy_spectrum[wl >= healthy_red_edge] = 0.4 + 0.05 * np.sin(wl[wl >= healthy_red_edge] / 100)
        spectra['健康'] = {
            'spectrum': healthy_spectrum,
            'severity': 0,
            'crop_type': '小麦',
            'description': '健康小麦叶片典型光谱，具有明显的红边特征'
        }
        
        stripe_rust_spectrum = healthy_spectrum.copy()
        stripe_rust_spectrum[wl < 680] *= 1.3
        stripe_rust_spectrum[(wl >= 680) & (wl < 750)] *= 0.7
        stripe_rust_spectrum[wl >= 750] *= 0.85
        spectra['条锈病'] = {
            'spectrum': stripe_rust_spectrum,
            'severity': 3,
            'crop_type': '小麦',
            'description': '小麦条锈病，黄色条纹状病斑，可见光反射率升高'
        }
        
        leaf_rust_spectrum = healthy_spectrum.copy()
        leaf_rust_spectrum[wl < 680] *= 1.5
        leaf_rust_spectrum[(wl >= 680) & (wl < 750)] *= 0.6
        leaf_rust_spectrum[wl >= 750] *= 0.8
        spectra['叶锈病'] = {
            'spectrum': leaf_rust_spectrum,
            'severity': 3,
            'crop_type': '小麦',
            'description': '小麦叶锈病，红褐色夏孢子堆，红边特征减弱'
        }
        
        powdery_mildew_spectrum = healthy_spectrum.copy()
        powdery_mildew_spectrum[wl < 700] *= 1.8
        powdery_mildew_spectrum[wl >= 700] *= 0.75
        spectra['白粉病'] = {
            'spectrum': powdery_mildew_spectrum,
            'severity': 2,
            'crop_type': '小麦',
            'description': '小麦白粉病，白色粉状物覆盖，可见光反射率显著升高'
        }
        
        scab_spectrum = healthy_spectrum.copy()
        scab_spectrum[wl < 700] *= 1.2
        scab_spectrum[(wl >= 700) & (wl < 900)] *= 0.65
        scab_spectrum[wl >= 900] *= 0.9
        spectra['赤霉病'] = {
            'spectrum': scab_spectrum,
            'severity': 4,
            'crop_type': '小麦',
            'description': '小麦赤霉病，穗部枯白，近红外反射率降低'
        }
        
        return spectra

    def add_spectrum(
        self,
        spectrum: np.ndarray,
        disease_name: str,
        severity: int = 1,
        crop_type: str = '小麦',
        description: str = ''
    ):
        self.library.append({
            'id': len(self.library) + 1,
            'spectrum': spectrum,
            'disease_name': disease_name,
            'severity': severity,
            'crop_type': crop_type,
            'description': description,
            'wavelengths': self.wavelengths
        })

    def search(
        self,
        query_spectrum: np.ndarray,
        method: str = 'spectral_angle',
        top_k: int = 5,
        preprocess: bool = True
    ) -> List[Dict]:
        if preprocess:
            query_processed = self.preprocessor.full_preprocessing_pipeline(
                query_spectrum, smooth=True, snv=True
            )
        else:
            query_processed = query_spectrum
        
        similarities = []
        for entry in self.library:
            if preprocess:
                lib_processed = self.preprocessor.full_preprocessing_pipeline(
                    entry['spectrum'], smooth=True, snv=True
                )
            else:
                lib_processed = entry['spectrum']
            
            similarity = self._calculate_similarity(
                query_processed, lib_processed, method
            )
            
            similarities.append({
                'id': entry['id'],
                'disease_name': entry['disease_name'],
                'severity': entry['severity'],
                'crop_type': entry['crop_type'],
                'description': entry['description'],
                'similarity': float(similarity),
                'method': method,
                'spectrum': entry['spectrum'].tolist()
            })
        
        if method in ['spectral_angle', 'pearson']:
            similarities.sort(key=lambda x: x['similarity'], reverse=True)
        else:
            similarities.sort(key=lambda x: x['similarity'], reverse=False)
        
        return similarities[:top_k]

    def _calculate_similarity(
        self,
        spec1: np.ndarray,
        spec2: np.ndarray,
        method: str
    ) -> float:
        if method == 'spectral_angle':
            return self._spectral_angle_mapper(spec1, spec2)
        elif method == 'euclidean':
            return -euclidean(spec1, spec2)
        elif method == 'cosine':
            return 1 - cosine(spec1, spec2)
        elif method == 'pearson':
            corr, _ = pearsonr(spec1, spec2)
            return corr
        elif method == 'sam':
            return self._spectral_angle_mapper(spec1, spec2)
        else:
            raise ValueError(f"Unknown similarity method: {method}")

    def _spectral_angle_mapper(self, spec1: np.ndarray, spec2: np.ndarray) -> float:
        dot_product = np.sum(spec1 * spec2)
        norm1 = np.linalg.norm(spec1)
        norm2 = np.linalg.norm(spec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0
        
        cos_angle = dot_product / (norm1 * norm2)
        cos_angle = np.clip(cos_angle, -1, 1)
        angle = np.arccos(cos_angle)
        
        return 1 - (angle / (np.pi / 2))

    def get_disease_signature(self, disease_name: str) -> Optional[Dict]:
        for entry in self.library:
            if entry['disease_name'] == disease_name:
                return {
                    'disease_name': entry['disease_name'],
                    'severity': entry['severity'],
                    'crop_type': entry['crop_type'],
                    'description': entry['description'],
                    'spectrum': entry['spectrum'].tolist(),
                    'wavelengths': self.wavelengths.tolist()
                }
        return None

    def get_all_diseases(self) -> List[str]:
        return list(set(entry['disease_name'] for entry in self.library))

    def get_library_summary(self) -> pd.DataFrame:
        data = []
        for entry in self.library:
            data.append({
                'id': entry['id'],
                'disease_name': entry['disease_name'],
                'severity': entry['severity'],
                'crop_type': entry['crop_type'],
                'description': entry['description']
            })
        return pd.DataFrame(data)
