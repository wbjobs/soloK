import numpy as np
from scipy import signal
from phase_vocoder import StereoPhaseVocoder


class VolumeControl:
    @staticmethod
    def apply(audio: np.ndarray, gain_db: float) -> np.ndarray:
        gain_linear = 10 ** (gain_db / 20.0)
        return audio * gain_linear


class Equalizer:
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate

    def _get_filter_order(self, base_order: int = 2) -> int:
        if self.sample_rate <= 48000:
            return base_order
        elif self.sample_rate <= 96000:
            return base_order + 1
        else:
            return base_order + 2

    def _butter_lowpass(self, cutoff: float, order: int = 2):
        nyquist = 0.5 * self.sample_rate
        normal_cutoff = cutoff / nyquist
        normal_cutoff = min(normal_cutoff, 0.9)
        normal_cutoff = max(normal_cutoff, 0.0001)
        b, a = signal.butter(order, normal_cutoff, btype="low", analog=False)
        return b, a

    def _butter_highpass(self, cutoff: float, order: int = 2):
        nyquist = 0.5 * self.sample_rate
        normal_cutoff = cutoff / nyquist
        normal_cutoff = min(normal_cutoff, 0.9)
        normal_cutoff = max(normal_cutoff, 0.0001)
        b, a = signal.butter(order, normal_cutoff, btype="high", analog=False)
        return b, a

    def _zero_phase_filter(self, b, a, audio):
        try:
            if audio.ndim == 2:
                result = np.zeros_like(audio, dtype=np.float64)
                for ch in range(audio.shape[0]):
                    result[ch] = signal.filtfilt(b, a, audio[ch])
                return result
            else:
                return signal.filtfilt(b, a, audio)
        except Exception as e:
            print(f"Filter warning: {e}, returning original")
            return audio.copy()

    def apply(self, audio: np.ndarray, low_gain_db: float = 0.0,
              mid_gain_db: float = 0.0, high_gain_db: float = 0.0) -> np.ndarray:
        if low_gain_db == 0 and mid_gain_db == 0 and high_gain_db == 0:
            return audio

        low_cutoff = 200
        high_cutoff = 2000
        order = self._get_filter_order()

        b_low, a_low = self._butter_lowpass(low_cutoff, order=order)
        b_high, a_high = self._butter_highpass(high_cutoff, order=order)

        low_band = self._zero_phase_filter(b_low, a_low, audio)
        high_band = self._zero_phase_filter(b_high, a_high, audio)

        low_passed = self._zero_phase_filter(b_low, a_low, audio)
        high_passed = self._zero_phase_filter(b_high, a_high, audio)
        mid_band = audio - low_passed - high_passed

        low_linear = 10 ** (low_gain_db / 20.0)
        mid_linear = 10 ** (mid_gain_db / 20.0)
        high_linear = 10 ** (high_gain_db / 20.0)

        output = low_band * low_linear + mid_band * mid_linear + high_band * high_linear

        peak = np.max(np.abs(output))
        if peak > 0.99 and peak > 0:
            output = output / peak * 0.95

        return output


class Reverb:
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate

    def apply(self, audio: np.ndarray, room_size: float = 0.5,
              decay: float = 0.5, wet_mix: float = 0.3) -> np.ndarray:
        room_size = np.clip(room_size, 0.1, 1.0)
        decay = np.clip(decay, 0.1, 0.9)
        wet_mix = np.clip(wet_mix, 0.0, 1.0)

        base_delays = [29.7, 37.1, 43.2, 49.8, 55.3, 61.7]
        num_delays = [int(d * self.sample_rate / 1000) for d in base_delays]
        decay_factors = [0.8, 0.75, 0.72, 0.68, 0.65, 0.62]

        wet_signal = np.zeros_like(audio, dtype=np.float64)

        for delay_samples, factor in zip(num_delays, decay_factors):
            delay_samples = max(1, int(delay_samples * room_size))
            if audio.ndim == 2:
                delayed = np.pad(audio, ((0, 0), (delay_samples, 0)))[:, :-delay_samples]
            else:
                delayed = np.pad(audio, (delay_samples, 0))[:-delay_samples]
            wet_signal += delayed * factor

        comb_delays_ms = [15.3, 21.7, 29.5, 37.3, 42.1, 50.2]
        comb_gains = [0.75, 0.7, 0.65, 0.62, 0.58, 0.55]

        for delay_ms, base_gain in zip(comb_delays_ms, comb_gains):
            delay_samples = max(1, int(delay_ms * self.sample_rate / 1000 * room_size))
            current_decay = decay * base_gain

            for tap in range(4):
                tap_delay = delay_samples * (tap + 1)
                tap_gain = current_decay ** (tap + 1)
                if audio.ndim == 2:
                    delayed = np.pad(audio, ((0, 0), (tap_delay, 0)))[:, :-tap_delay]
                else:
                    delayed = np.pad(audio, (tap_delay, 0))[:-tap_delay]
                wet_signal += delayed * tap_gain

        wet_peak = np.max(np.abs(wet_signal))
        if wet_peak > 0.5:
            wet_signal = wet_signal / wet_peak * 0.5

        dry_mix = 1.0 - wet_mix
        output = audio * dry_mix + wet_signal * wet_mix

        peak = np.max(np.abs(output))
        if peak > 0.99:
            output = output / peak * 0.95

        return output


class Delay:
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate

    def apply(self, audio: np.ndarray, delay_ms: float = 300.0,
              feedback: float = 0.4, wet_mix: float = 0.3) -> np.ndarray:
        delay_ms = max(10.0, min(delay_ms, 2000.0))
        feedback = np.clip(feedback, 0.0, 0.8)
        wet_mix = np.clip(wet_mix, 0.0, 1.0)

        delay_samples = max(1, int(delay_ms * self.sample_rate / 1000.0))

        if audio.ndim == 2:
            channels, samples = audio.shape
            wet_signal = np.zeros_like(audio, dtype=np.float64)
            for ch in range(channels):
                current = audio[ch].astype(np.float64).copy()
                for tap in range(6):
                    tap_delay = delay_samples * (tap + 1)
                    tap_gain = feedback ** (tap + 1)
                    delayed = np.pad(current, (tap_delay, 0))[:-tap_delay]
                    wet_signal[ch] += delayed * tap_gain
        else:
            wet_signal = np.zeros_like(audio, dtype=np.float64)
            current = audio.astype(np.float64).copy()
            for tap in range(6):
                tap_delay = delay_samples * (tap + 1)
                tap_gain = feedback ** (tap + 1)
                delayed = np.pad(current, (tap_delay, 0))[:-tap_delay]
                wet_signal += delayed * tap_gain

        wet_peak = np.max(np.abs(wet_signal))
        if wet_peak > 0.7:
            wet_signal = wet_signal / wet_peak * 0.7

        dry_mix = 1.0 - wet_mix
        output = audio * dry_mix + wet_signal * wet_mix

        peak = np.max(np.abs(output))
        if peak > 0.99:
            output = output / peak * 0.95

        return output


class EffectChain:
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate
        self.volume = VolumeControl()
        self.equalizer = Equalizer(sample_rate)
        self.reverb = Reverb(sample_rate)
        self.delay = Delay(sample_rate)
        self.vocoder = StereoPhaseVocoder(sample_rate)

    def apply(self, audio: np.ndarray, config: dict, original_bpm: float = None) -> np.ndarray:
        processed = audio.astype(np.float64).copy()

        if config.get("pitch_shift", 0) != 0:
            semitones = config.get("pitch_shift", 0)
            semitones = max(-12.0, min(semitones, 12.0))
            print(f"  Pitch shifting: {semitones:+.1f} semitones")
            processed = self.vocoder.pitch_shift(processed, semitones)

        if config.get("target_bpm", None) is not None and original_bpm is not None:
            target_bpm = config.get("target_bpm")
            if abs(original_bpm - target_bpm) > 0.1 and original_bpm > 0:
                print(f"  Time stretching: {original_bpm:.1f} BPM -> {target_bpm:.1f} BPM")
                processed = self.vocoder.stretch_to_bpm(processed, original_bpm, target_bpm)

        if config.get("time_stretch", 1.0) != 1.0:
            stretch_factor = config.get("time_stretch", 1.0)
            stretch_factor = max(0.25, min(stretch_factor, 4.0))
            print(f"  Time stretching by factor: {stretch_factor:.2f}")
            processed = self.vocoder.time_stretch(processed, stretch_factor)

        processed = self.volume.apply(processed, config.get("volume", 0.0))

        processed = self.equalizer.apply(
            processed,
            low_gain_db=config.get("eq_low", 0.0),
            mid_gain_db=config.get("eq_mid", 0.0),
            high_gain_db=config.get("eq_high", 0.0)
        )

        if config.get("reverb_enable", False):
            processed = self.reverb.apply(
                processed,
                room_size=config.get("reverb_room_size", 0.5),
                decay=config.get("reverb_decay", 0.5),
                wet_mix=config.get("reverb_wet", 0.3)
            )

        if config.get("delay_enable", False):
            processed = self.delay.apply(
                processed,
                delay_ms=config.get("delay_time", 300.0),
                feedback=config.get("delay_feedback", 0.4),
                wet_mix=config.get("delay_wet", 0.3)
            )

        peak = np.max(np.abs(processed))
        if peak > 0.99:
            processed = processed / peak * 0.95

        return processed.astype(np.float32)
