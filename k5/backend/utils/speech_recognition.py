import os
import io
import tempfile
import numpy as np
from typing import Dict, List, Optional, Tuple
from utils.ipa_mapping import pinyin_to_ipa


class WhisperRecognizer:
    def __init__(self, model_size: str = 'base', language: str = 'zh'):
        self.model_size = model_size
        self.language = language
        self.model = None
        self._model_loaded = False

    def load_model(self):
        if self._model_loaded:
            return
        try:
            import whisper
            self.model = whisper.load_model(self.model_size)
            self._model_loaded = True
        except Exception as e:
            print(f"Warning: Failed to load Whisper model: {e}")
            self.model = None

    def transcribe(self, audio: np.ndarray, sr: int = 16000) -> Dict:
        self.load_model()
        
        if self.model is None:
            return {
                'text': '',
                'segments': [],
                'language': self.language,
                'success': False,
                'error': 'Whisper model not available'
            }

        try:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                import soundfile as sf
                sf.write(tmp.name, audio, sr)
                tmp_path = tmp.name

            result = self.model.transcribe(
                tmp_path,
                language=self.language,
                word_timestamps=True,
                fp16=False
            )

            os.unlink(tmp_path)

            segments = []
            if result.get('segments'):
                for seg in result['segments']:
                    segments.append({
                        'start_time': float(seg['start']),
                        'end_time': float(seg['end']),
                        'text': seg.get('text', '').strip(),
                        'confidence': float(seg.get('avg_logprob', -5))
                    })

            return {
                'text': result.get('text', '').strip(),
                'segments': segments,
                'language': result.get('language', self.language),
                'success': True,
                'error': None
            }
        except Exception as e:
            return {
                'text': '',
                'segments': [],
                'language': self.language,
                'success': False,
                'error': str(e)
            }

    def transcribe_to_phonemes(self, audio: np.ndarray, sr: int = 16000,
                                dialect_code: str = 'mandarin') -> Dict:
        result = self.transcribe(audio, sr)
        
        if not result['success']:
            return result

        text = result['text']
        segments = result['segments']

        phonemes = self._text_to_phonemes(text, segments, audio, sr, dialect_code)

        return {
            'text': text,
            'phonemes': phonemes,
            'segments': segments,
            'language': result['language'],
            'success': True,
            'error': None
        }

    def _text_to_phonemes(self, text: str, segments: List[Dict],
                          audio: np.ndarray, sr: int, dialect_code: str) -> List[Dict]:
        if not segments:
            duration = len(audio) / sr
            return [{
                'start_time': 0.0,
                'end_time': duration,
                'phoneme': '',
                'pinyin': text,
                'ipa': pinyin_to_ipa(text),
                'tone': None,
                'confidence': 0.3
            }]

        phonemes = []
        pinyin_text = self._chinese_to_pinyin(text)
        pinyin_chars = [c for c in pinyin_text.split() if c]

        segment_start = segments[0]['start_time']
        segment_end = segments[-1]['end_time']
        segment_duration = segment_end - segment_start

        if not pinyin_chars:
            for seg in segments:
                phonemes.append({
                    'start_time': seg['start_time'],
                    'end_time': seg['end_time'],
                    'phoneme': seg['text'],
                    'pinyin': seg['text'],
                    'ipa': pinyin_to_ipa(seg['text']),
                    'tone': None,
                    'confidence': 0.4
                })
            return phonemes

        total_chars = len(pinyin_chars)
        char_duration = segment_duration / max(total_chars, 1)

        for i, pinyin_char in enumerate(pinyin_chars):
            tone = self._extract_tone(pinyin_char)
            pinyin_clean = self._strip_tone(pinyin_char)

            start = segment_start + i * char_duration
            end = segment_start + (i + 1) * char_duration

            phonemes.append({
                'start_time': round(start, 4),
                'end_time': round(end, 4),
                'phoneme': pinyin_clean,
                'pinyin': pinyin_char,
                'ipa': pinyin_to_ipa(pinyin_clean),
                'tone': tone,
                'confidence': 0.7
            })

        return phonemes

    def _chinese_to_pinyin(self, text: str) -> str:
        try:
            import pypinyin
            from pypinyin import Style
            
            pinyin_list = pypinyin.pinyin(text, style=Style.TONE3)
            return ' '.join([item[0] for item in pinyin_list if item])
        except ImportError:
            return text

    def _extract_tone(self, pinyin: str) -> Optional[int]:
        for i in range(1, 10):
            if str(i) in pinyin:
                return i
        return None

    def _strip_tone(self, pinyin: str) -> str:
        return ''.join([c for c in pinyin if not c.isdigit()])


_whisper_recognizer = None


def get_whisper_recognizer(model_size: str = 'base') -> WhisperRecognizer:
    global _whisper_recognizer
    if _whisper_recognizer is None:
        _whisper_recognizer = WhisperRecognizer(model_size=model_size)
    return _whisper_recognizer


def transcribe_audio(audio: np.ndarray, sr: int = 16000, 
                     dialect_code: str = 'mandarin',
                     use_whisper: bool = True) -> Dict:
    if use_whisper:
        try:
            recognizer = get_whisper_recognizer()
            result = recognizer.transcribe_to_phonemes(audio, sr, dialect_code)
            if result['success']:
                return result
        except Exception as e:
            print(f"Whisper transcription failed, falling back: {e}")

    from utils.audio_processing import detect_phoneme_boundaries
    
    fallback_phonemes = detect_phoneme_boundaries(audio, sr)
    return {
        'text': '',
        'phonemes': fallback_phonemes,
        'segments': [],
        'language': 'zh',
        'success': True,
        'error': None,
        'fallback': True
    }


def generate_initial_annotation_with_asr(audio: np.ndarray, sr: int,
                                         dialect_code: str = 'mandarin',
                                         use_whisper: bool = True) -> Dict:
    from utils.audio_processing import generate_waveform_data, generate_spectrogram_data

    asr_result = transcribe_audio(audio, sr, dialect_code, use_whisper)
    
    phonemes = asr_result.get('phonemes', [])
    
    if not phonemes:
        from utils.audio_processing import detect_phoneme_boundaries
        phonemes = detect_phoneme_boundaries(audio, sr)

    waveform = generate_waveform_data(audio, sr)
    spectrogram = generate_spectrogram_data(audio, sr)

    return {
        'phonemes': phonemes,
        'waveform': waveform,
        'spectrogram': spectrogram,
        'duration': len(audio) / sr,
        'transcript': asr_result.get('text', ''),
        'asr_segments': asr_result.get('segments', []),
        'asr_success': asr_result.get('success', False),
        'asr_error': asr_result.get('error')
    }
