import numpy as np


class PhaseVocoder:
    def __init__(self, sample_rate: int, fft_size: int = 2048, hop_size: int = 512):
        self.sample_rate = sample_rate
        self.fft_size = fft_size
        self.hop_size = hop_size
        self.window = np.hanning(fft_size)

    def _stft(self, audio: np.ndarray, hop: int) -> np.ndarray:
        n_frames = max(0, (len(audio) - self.fft_size) // hop + 1)
        if n_frames == 0:
            return np.zeros((self.fft_size // 2 + 1, 0), dtype=np.complex128)

        frames = np.zeros((n_frames, self.fft_size))
        for i in range(n_frames):
            start = i * hop
            frames[i] = audio[start:start + self.fft_size] * self.window

        return np.fft.rfft(frames, axis=1).T

    def _istft(self, stft_matrix: np.ndarray, hop: int) -> np.ndarray:
        n_frames = stft_matrix.shape[1]
        frames = np.fft.irfft(stft_matrix.T, n=self.fft_size, axis=1)

        output_len = (n_frames - 1) * hop + self.fft_size
        output = np.zeros(output_len)
        win_sum = np.zeros(output_len)

        for i in range(n_frames):
            start = i * hop
            end = start + self.fft_size
            output[start:end] += frames[i] * self.window
            win_sum[start:end] += self.window ** 2

        mask = win_sum > 1e-8
        output[mask] /= win_sum[mask]

        return output

    def time_stretch(self, audio: np.ndarray, stretch_factor: float) -> np.ndarray:
        if abs(stretch_factor - 1.0) < 0.001:
            return audio.copy()

        stretch_factor = np.clip(stretch_factor, 0.25, 4.0)

        hop_a = self.hop_size
        hop_s = self.hop_size

        stft = self._stft(audio, hop_a)
        n_bins, n_frames = stft.shape

        if n_frames < 2:
            return audio.copy()

        n_out_frames = max(1, int(n_frames / stretch_factor))

        freq_per_bin = self.sample_rate / self.fft_size
        expected_phase_inc = 2.0 * np.pi * np.arange(n_bins) * hop_a / self.fft_size

        phase_accum = np.angle(stft[:, 0]).copy()
        stft_out = np.zeros((n_bins, n_out_frames), dtype=np.complex128)
        stft_out[:, 0] = np.abs(stft[:, 0]) * np.exp(1j * phase_accum)

        for j in range(1, n_out_frames):
            i_float = j * stretch_factor
            i_prev = int(i_float)
            i_next = min(i_prev + 1, n_frames - 1)
            frac = i_float - i_prev

            mag_curr = (1.0 - frac) * np.abs(stft[:, i_prev]) + frac * np.abs(stft[:, i_next])

            phase_curr = np.angle(stft[:, i_prev])
            phase_prev = np.angle(stft[:, max(i_prev - 1, 0)])

            dphi = phase_curr - phase_prev
            dphi -= expected_phase_inc
            dphi = dphi - 2.0 * np.pi * np.round(dphi / (2.0 * np.pi))
            dphi += expected_phase_inc

            inst_freq = dphi / hop_a
            phase_accum += inst_freq * hop_s

            stft_out[:, j] = mag_curr * np.exp(1j * phase_accum)

        output = self._istft(stft_out, hop_s)

        target_len = int(len(audio) / stretch_factor)
        if len(output) > target_len:
            output = output[:target_len]
        elif len(output) < target_len:
            output = np.pad(output, (0, target_len - len(output)))

        peak = np.max(np.abs(output))
        if peak > 0 and np.isfinite(peak):
            orig_peak = np.max(np.abs(audio))
            if orig_peak > 0:
                output = output * (orig_peak / peak)

        return output

    def pitch_shift(self, audio: np.ndarray, semitones: float) -> np.ndarray:
        if abs(semitones) < 0.01:
            return audio.copy()

        semitones = np.clip(semitones, -12.0, 12.0)
        stretch_factor = 2.0 ** (semitones / 12.0)

        stretched = self.time_stretch(audio, 1.0 / stretch_factor)

        n_samples = len(stretched)
        resampled_len = max(1, int(n_samples * stretch_factor))

        x_old = np.linspace(0, 1, n_samples)
        x_new = np.linspace(0, 1, resampled_len)
        resampled = np.interp(x_new, x_old, stretched)

        if len(resampled) > len(audio):
            resampled = resampled[:len(audio)]
        elif len(resampled) < len(audio):
            resampled = np.pad(resampled, (0, len(audio) - len(resampled)))

        return resampled

    def stretch_to_bpm(self, audio: np.ndarray, original_bpm: float, target_bpm: float) -> np.ndarray:
        if abs(original_bpm - target_bpm) < 0.1 or original_bpm <= 0:
            return audio.copy()

        stretch_factor = original_bpm / target_bpm
        return self.time_stretch(audio, stretch_factor)


class StereoPhaseVocoder:
    def __init__(self, sample_rate: int, fft_size: int = 2048, hop_size: int = 512):
        self.vocoder = PhaseVocoder(sample_rate, fft_size, hop_size)

    def _process_channels(self, audio: np.ndarray, method: str, **kwargs) -> np.ndarray:
        if audio.ndim == 1:
            return getattr(self.vocoder, method)(audio, **kwargs)

        channels = audio.shape[0]
        results = []
        for ch in range(channels):
            result = getattr(self.vocoder, method)(audio[ch], **kwargs)
            results.append(result)

        max_len = max(len(r) for r in results)
        output = np.zeros((channels, max_len), dtype=np.float64)
        for ch in range(channels):
            output[ch, :len(results[ch])] = results[ch]

        return output

    def time_stretch(self, audio: np.ndarray, stretch_factor: float) -> np.ndarray:
        return self._process_channels(audio, "time_stretch", stretch_factor=stretch_factor)

    def pitch_shift(self, audio: np.ndarray, semitones: float) -> np.ndarray:
        if audio.ndim == 1:
            result = self.vocoder.pitch_shift(audio, semitones)
            return result

        channels = audio.shape[0]
        target_len = audio.shape[1]
        results = []
        for ch in range(channels):
            result = self.vocoder.pitch_shift(audio[ch], semitones)
            results.append(result)

        output = np.zeros((channels, target_len), dtype=np.float64)
        for ch in range(channels):
            r = results[ch]
            if len(r) > target_len:
                output[ch] = r[:target_len]
            else:
                output[ch, :len(r)] = r

        return output

    def stretch_to_bpm(self, audio: np.ndarray, original_bpm: float, target_bpm: float) -> np.ndarray:
        return self._process_channels(audio, "stretch_to_bpm", original_bpm=original_bpm, target_bpm=target_bpm)
