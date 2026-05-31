import os
import numpy as np
import torch
import torchaudio
from demucs import pretrained
from demucs.audio import AudioFile, save_audio


class StemSeparator:
    def __init__(self, model_name: str = "htdemucs"):
        self.model_name = model_name
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.sources = ["drums", "bass", "other", "vocals"]

    def load_model(self):
        if self.model is None:
            print(f"Loading Demucs model: {self.model_name} on {self.device}")
            self.model = pretrained.get_model(self.model_name)
            self.model.to(self.device)
            self.model.eval()

    def separate(self, input_path: str, output_dir: str = None, export_stems: bool = False):
        self.load_model()

        if output_dir is None:
            output_dir = os.path.splitext(input_path)[0] + "_stems"
        os.makedirs(output_dir, exist_ok=True)

        print(f"Separating: {input_path}")

        audio_file = AudioFile(input_path)
        audio = audio_file.read(
            frames=0,
            seek_time=0,
            duration=audio_file.duration,
            sample_rate=self.model.samplerate,
            channels=self.model.audio_channels,
        )

        audio = audio.to(self.device)

        with torch.no_grad():
            ref = audio.mean(0)
            audio = (audio - ref.mean()) / ref.std()
            sources = self.model(audio[None])[0]
            sources = sources * ref.std() + ref.mean()

        stems = {}
        for source, name in zip(sources, self.sources):
            stem_audio = source.cpu().numpy()
            stems[name] = stem_audio

            if export_stems:
                stem_path = os.path.join(output_dir, f"{name}.wav")
                save_audio(
                    source.cpu(),
                    stem_path,
                    self.model.samplerate,
                    clip="rescale",
                    as_float=False,
                )
                print(f"Exported: {stem_path}")

        return stems, self.model.samplerate

    def get_samplerate(self):
        self.load_model()
        return self.model.samplerate
