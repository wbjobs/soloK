import os
import numpy as np
import soundfile as sf
from effects import EffectChain
from bpm_detector import BPMDetector


class AudioMixer:
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate
        self.effect_chain = EffectChain(sample_rate)
        self.bpm_detector = BPMDetector(sample_rate)

    def detect_bpm(self, audio: np.ndarray) -> float:
        return self.bpm_detector.detect(audio)

    def detect_bpm_with_confidence(self, audio: np.ndarray) -> tuple:
        return self.bpm_detector.detect_with_confidence(audio)

    def process_stem(self, audio: np.ndarray, stem_config: dict, original_bpm: float = None) -> np.ndarray:
        return self.effect_chain.apply(audio, stem_config, original_bpm=original_bpm)

    def mix(self, stems: dict, mix_config: dict, original_bpm: float = None) -> np.ndarray:
        processed_stems = {}
        max_length = 0

        for stem_name, audio in stems.items():
            config = mix_config.get(stem_name, {})
            print(f"Processing stem: {stem_name}")
            processed = self.process_stem(audio, config, original_bpm=original_bpm)
            processed_stems[stem_name] = processed
            max_length = max(max_length, processed.shape[-1])

        mixed = np.zeros((2, max_length), dtype=np.float64)

        for stem_name, audio in processed_stems.items():
            if audio.ndim == 1:
                audio = np.stack([audio, audio], axis=0)
            elif audio.shape[0] == 1:
                audio = np.repeat(audio, 2, axis=0)

            length = audio.shape[-1]
            if length < max_length:
                padding = max_length - length
                audio = np.pad(audio, ((0, 0), (0, padding)))
            elif length > max_length:
                audio = audio[:, :max_length]

            mixed += audio

        peak = np.max(np.abs(mixed))
        if peak > 1.0:
            mixed = mixed / peak * 0.95

        return mixed

    def export(self, audio: np.ndarray, output_path: str) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        sf.write(output_path, audio.T, self.sample_rate, subtype="PCM_16")
        print(f"Exported mixed audio to: {output_path}")

    def export_stems(self, stems: dict, output_dir: str) -> None:
        os.makedirs(output_dir, exist_ok=True)
        for stem_name, audio in stems.items():
            stem_path = os.path.join(output_dir, f"{stem_name}.wav")
            audio_to_write = audio.T if audio.ndim == 2 else audio
            sf.write(stem_path, audio_to_write, self.sample_rate, subtype="PCM_16")
            print(f"Exported stem: {stem_path}")
