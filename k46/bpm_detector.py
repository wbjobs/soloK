import numpy as np
from scipy import signal


class BPMDetector:
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate

    def _compute_onset_envelope(self, audio: np.ndarray) -> np.ndarray:
        if audio.ndim == 2:
            mono = np.mean(audio, axis=0)
        else:
            mono = audio.copy()

        frame_size = 1024
        hop_size = 512
        n_frames = (len(mono) - frame_size) // hop_size

        if n_frames < 2:
            return np.array([])

        window = np.hanning(frame_size)
        spectrum = np.zeros((n_frames, frame_size // 2 + 1))

        for i in range(n_frames):
            start = i * hop_size
            frame = mono[start:start + frame_size] * window
            spec = np.abs(np.fft.rfft(frame))
            spectrum[i] = spec

        flux = np.zeros(n_frames)
        for i in range(1, n_frames):
            diff = spectrum[i] - spectrum[i - 1]
            diff = np.maximum(diff, 0)
            flux[i] = np.sum(diff)

        return flux

    def detect(self, audio: np.ndarray, bpm_range: tuple = (60, 200)) -> float:
        onset_env = self._compute_onset_envelope(audio)

        if len(onset_env) < 2:
            return 120.0

        onset_env = onset_env - np.mean(onset_env)

        hop_size = 512
        onset_sr = self.sample_rate / hop_size

        min_lag = int(onset_sr * 60.0 / bpm_range[1])
        max_lag = int(onset_sr * 60.0 / bpm_range[0])
        max_lag = min(max_lag, len(onset_env) // 2)

        if min_lag >= max_lag:
            return 120.0

        corr = np.correlate(onset_env, onset_env, mode="full")
        corr = corr[len(onset_env) - 1:]

        corr_segment = corr[min_lag:max_lag + 1]
        if len(corr_segment) == 0 or np.max(np.abs(corr_segment)) == 0:
            return 120.0

        best_lag_offset = np.argmax(corr_segment)
        best_lag = best_lag_offset + min_lag

        if best_lag <= 0:
            return 120.0

        bpm = onset_sr * 60.0 / best_lag

        if bpm < bpm_range[0]:
            bpm *= 2
        elif bpm > bpm_range[1]:
            bpm /= 2

        return round(bpm, 1)

    def detect_with_confidence(self, audio: np.ndarray, bpm_range: tuple = (60, 200)) -> tuple:
        onset_env = self._compute_onset_envelope(audio)

        if len(onset_env) < 2:
            return 120.0, 0.0

        onset_env = onset_env - np.mean(onset_env)

        hop_size = 512
        onset_sr = self.sample_rate / hop_size

        min_lag = int(onset_sr * 60.0 / bpm_range[1])
        max_lag = int(onset_sr * 60.0 / bpm_range[0])
        max_lag = min(max_lag, len(onset_env) // 2)

        if min_lag >= max_lag:
            return 120.0, 0.0

        corr = np.correlate(onset_env, onset_env, mode="full")
        corr = corr[len(onset_env) - 1:]

        corr_segment = corr[min_lag:max_lag + 1]
        if len(corr_segment) == 0 or np.max(np.abs(corr_segment)) == 0:
            return 120.0, 0.0

        best_idx = np.argmax(corr_segment)
        best_lag = best_idx + min_lag

        if best_idx > 0 and best_idx < len(corr_segment) - 1:
            alpha = corr_segment[best_idx - 1]
            beta = corr_segment[best_idx]
            gamma = corr_segment[best_idx + 1]
            denom = alpha - 2 * beta + gamma
            if abs(denom) > 1e-10:
                shift = 0.5 * (alpha - gamma) / denom
                best_lag = best_lag + shift

        if best_lag <= 0:
            return 120.0, 0.0

        bpm = onset_sr * 60.0 / best_lag

        if bpm < bpm_range[0]:
            bpm *= 2
        elif bpm > bpm_range[1]:
            bpm /= 2

        total_energy = np.sum(np.abs(corr_segment))
        if total_energy > 0:
            confidence = corr_segment[best_idx] / total_energy
        else:
            confidence = 0.0

        return round(bpm, 1), round(float(confidence), 3)
