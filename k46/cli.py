import os
import numpy as np
import yaml
import click
from stem_separator import StemSeparator
from mixer import AudioMixer


def load_config(config_path: str) -> dict:
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@click.group()
def cli():
    pass


@cli.command()
@click.argument("input_path", type=click.Path(exists=True))
@click.option("--config", "-c", type=click.Path(), default="config.yaml", help="Mix config file path")
@click.option("--output", "-o", type=click.Path(), default="output/mixed.wav", help="Output file path")
@click.option("--export-stems", is_flag=True, help="Export separated stems individually")
@click.option("--stems-dir", type=click.Path(), default=None, help="Directory to export stems")
@click.option("--bpm", type=float, default=None, help="Override original BPM (skip auto-detection)")
@click.option("--target-bpm", type=float, default=None, help="Global target BPM for time stretching")
def mix(input_path, config, output, export_stems, stems_dir, bpm, target_bpm):
    if not os.path.exists(config):
        click.echo(f"Config file not found: {config}")
        click.echo("Using default configuration...")
        mix_config = get_default_config()
    else:
        mix_config = load_config(config)

    if target_bpm is not None:
        for stem_name in mix_config:
            if isinstance(mix_config[stem_name], dict):
                mix_config[stem_name]["target_bpm"] = target_bpm

    click.echo("Starting audio separation and mixing...")

    separator = StemSeparator()
    stems, sample_rate = separator.separate(input_path, export_stems=export_stems)

    mixer = AudioMixer(sample_rate)

    if bpm is None:
        click.echo("Auto-detecting BPM...")
        all_audio = np.zeros_like(list(stems.values())[0], dtype=np.float64)
        for stem_audio in stems.values():
            all_audio += stem_audio
        detected_bpm, confidence = mixer.detect_bpm_with_confidence(all_audio)
        click.echo(f"Detected BPM: {detected_bpm} (confidence: {confidence})")
        original_bpm = detected_bpm
    else:
        original_bpm = bpm
        click.echo(f"Using specified BPM: {original_bpm}")

    if export_stems:
        stems_output_dir = stems_dir or os.path.splitext(input_path)[0] + "_stems"
        mixer.export_stems(stems, stems_output_dir)

    click.echo("Applying effects and mixing...")
    mixed_audio = mixer.mix(stems, mix_config, original_bpm=original_bpm)
    mixer.export(mixed_audio, output)

    click.echo("Done!")


@cli.command()
@click.argument("input_path", type=click.Path(exists=True))
@click.option("--output-dir", "-o", type=click.Path(), default=None, help="Output directory for stems")
def separate(input_path, output_dir):
    click.echo("Separating audio stems...")

    separator = StemSeparator()
    stems, sample_rate = separator.separate(input_path, output_dir=output_dir, export_stems=True)

    click.echo("Stem separation complete!")


@cli.command()
@click.argument("input_path", type=click.Path(exists=True))
def bpm(input_path):
    click.echo("Detecting BPM...")

    import soundfile as sf
    audio, sr = sf.read(input_path, dtype="float32")
    if audio.ndim == 2:
        audio = audio.T
    else:
        audio = audio[np.newaxis, :]

    from bpm_detector import BPMDetector
    detector = BPMDetector(sr)
    detected_bpm, confidence = detector.detect_with_confidence(audio)

    click.echo(f"Detected BPM: {detected_bpm}")
    click.echo(f"Confidence: {confidence}")


@cli.command()
@click.option("--output", "-o", type=click.Path(), default="config.yaml", help="Output config file path")
def init_config(output):
    config = get_default_config()
    with open(output, "w", encoding="utf-8") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    click.echo(f"Default config file created: {output}")


def get_default_config() -> dict:
    stem_defaults = {
        "volume": 0.0,
        "eq_low": 0.0,
        "eq_mid": 0.0,
        "eq_high": 0.0,
        "reverb_enable": False,
        "reverb_room_size": 0.5,
        "reverb_decay": 0.5,
        "reverb_wet": 0.3,
        "delay_enable": False,
        "delay_time": 300.0,
        "delay_feedback": 0.4,
        "delay_wet": 0.3,
        "pitch_shift": 0,
        "target_bpm": None,
        "time_stretch": 1.0
    }

    return {
        "vocals": {**stem_defaults},
        "drums": {**stem_defaults},
        "bass": {**stem_defaults},
        "other": {**stem_defaults}
    }


if __name__ == "__main__":
    cli()
