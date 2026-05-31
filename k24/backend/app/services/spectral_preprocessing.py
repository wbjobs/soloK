import numpy as np
from scipy.signal import savgol_filter
from scipy.interpolate import interp1d
from typing import Optional, Tuple


class SpectralPreprocessor:
    def __init__(self, wavelengths: Optional[np.ndarray] = None):
        self.wavelengths = wavelengths

    def savitzky_golay_smooth(
        self,
        spectrum: np.ndarray,
        window_length: int = 11,
        polyorder: int = 2,
        deriv: int = 0
    ) -> np.ndarray:
        if spectrum.ndim == 1:
            return savgol_filter(spectrum, window_length, polyorder, deriv=deriv)
        elif spectrum.ndim == 2:
            return np.array([
                savgol_filter(s, window_length, polyorder, deriv=deriv)
                for s in spectrum
            ])
        else:
            raise ValueError("Spectrum must be 1D or 2D array")

    def standard_normal_variate(self, spectrum: np.ndarray) -> np.ndarray:
        if spectrum.ndim == 1:
            mean = np.mean(spectrum)
            std = np.std(spectrum)
            return (spectrum - mean) / (std + 1e-8)
        elif spectrum.ndim == 2:
            mean = np.mean(spectrum, axis=1, keepdims=True)
            std = np.std(spectrum, axis=1, keepdims=True)
            return (spectrum - mean) / (std + 1e-8)
        else:
            raise ValueError("Spectrum must be 1D or 2D array")

    def first_derivative(self, spectrum: np.ndarray) -> np.ndarray:
        if spectrum.ndim == 1:
            return np.gradient(spectrum)
        elif spectrum.ndim == 2:
            return np.gradient(spectrum, axis=1)
        else:
            raise ValueError("Spectrum must be 1D or 2D array")

    def second_derivative(self, spectrum: np.ndarray) -> np.ndarray:
        if spectrum.ndim == 1:
            return np.gradient(np.gradient(spectrum))
        elif spectrum.ndim == 2:
            return np.gradient(np.gradient(spectrum, axis=1), axis=1)
        else:
            raise ValueError("Spectrum must be 1D or 2D array")

    def remove_baseline(self, spectrum: np.ndarray, method: str = 'als') -> np.ndarray:
        if method == 'als':
            return self._als_baseline_removal(spectrum)
        elif method == 'polyfit':
            return self._polyfit_baseline_removal(spectrum)
        else:
            raise ValueError(f"Unknown method: {method}")

    def _als_baseline_removal(
        self,
        spectrum: np.ndarray,
        lam: float = 1e5,
        p: float = 0.01,
        niter: int = 10
    ) -> np.ndarray:
        from scipy import sparse
        from scipy.sparse.linalg import spsolve

        if spectrum.ndim == 1:
            L = len(spectrum)
            D = sparse.diags([1, -2, 1], [0, -1, -2], shape=(L, L-2))
            D = lam * D.dot(D.transpose())
            w = np.ones(L)
            for _ in range(niter):
                W = sparse.spdiags(w, 0, L, L)
                Z = W + D
                z = spsolve(Z, w * spectrum)
                w = p * (spectrum > z) + (1 - p) * (spectrum < z)
            return spectrum - z
        else:
            return np.array([self._als_baseline_removal(s, lam, p, niter) for s in spectrum])

    def _polyfit_baseline_removal(
        self,
        spectrum: np.ndarray,
        poly_order: int = 3
    ) -> np.ndarray:
        if spectrum.ndim == 1:
            x = np.arange(len(spectrum))
            coeffs = np.polyfit(x, spectrum, poly_order)
            baseline = np.polyval(coeffs, x)
            return spectrum - baseline
        else:
            return np.array([self._polyfit_baseline_removal(s, poly_order) for s in spectrum])

    def normalize(self, spectrum: np.ndarray, method: str = 'minmax') -> np.ndarray:
        if method == 'minmax':
            if spectrum.ndim == 1:
                min_val = np.min(spectrum)
                max_val = np.max(spectrum)
                return (spectrum - min_val) / (max_val - min_val + 1e-8)
            else:
                min_val = np.min(spectrum, axis=1, keepdims=True)
                max_val = np.max(spectrum, axis=1, keepdims=True)
                return (spectrum - min_val) / (max_val - min_val + 1e-8)
        elif method == 'l2':
            if spectrum.ndim == 1:
                norm = np.linalg.norm(spectrum)
                return spectrum / (norm + 1e-8)
            else:
                norm = np.linalg.norm(spectrum, axis=1, keepdims=True)
                return spectrum / (norm + 1e-8)
        else:
            raise ValueError(f"Unknown normalization method: {method}")

    def resample_spectrum(
        self,
        spectrum: np.ndarray,
        old_wavelengths: np.ndarray,
        new_wavelengths: np.ndarray,
        kind: str = 'linear'
    ) -> np.ndarray:
        if spectrum.ndim == 1:
            f = interp1d(old_wavelengths, spectrum, kind=kind, fill_value='extrapolate')
            return f(new_wavelengths)
        else:
            resampled = []
            for s in spectrum:
                f = interp1d(old_wavelengths, s, kind=kind, fill_value='extrapolate')
                resampled.append(f(new_wavelengths))
            return np.array(resampled)

    def full_preprocessing_pipeline(
        self,
        spectrum: np.ndarray,
        smooth: bool = True,
        snv: bool = True,
        derivative: int = 0
    ) -> np.ndarray:
        processed = spectrum.copy()
        
        if smooth:
            processed = self.savitzky_golay_smooth(processed)
        
        if snv:
            processed = self.standard_normal_variate(processed)
        
        if derivative == 1:
            processed = self.first_derivative(processed)
        elif derivative == 2:
            processed = self.second_derivative(processed)
        
        return processed

    def process_hypercube(
        self,
        hypercube: np.ndarray,
        smooth: bool = True,
        snv: bool = True,
        derivative: int = 0
    ) -> np.ndarray:
        height, width, bands = hypercube.shape
        reshaped = hypercube.reshape(-1, bands)
        processed = self.full_preprocessing_pipeline(reshaped, smooth, snv, derivative)
        return processed.reshape(height, width, bands)
