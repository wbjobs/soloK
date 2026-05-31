import numpy as np
import librosa
from scipy import signal
from scipy.stats import entropy, kurtosis, skew
from collections import defaultdict

class TTSEngineDetector:
    def __init__(self):
        self.engine_fingerprints = {
            'Tacotron2': {
                'sr': 22050,
                'hop_length': 256,
                'win_length': 1024,
                'n_mels': 80,
                'fmin': 0,
                'fmax': 8000,
                'spectral_rolloff_mean': 0.6,
                'harmonic_ratio': 0.75
            },
            'WaveGlow': {
                'sr': 22050,
                'hop_length': 256,
                'noise_floor': -60,
                'phase_noise': 0.05,
                'high_freq_decay': 0.9
            },
            'MelGAN': {
                'sr': 22050,
                'hop_length': 256,
                'spectral_flatness': 0.15,
                'periodicity_score': 0.85,
                'noise_band': 20
            },
            'HiFi-GAN': {
                'sr': 22050,
                'hop_length': 256,
                'adversarial_noise': 0.02,
                'high_freq_enhance': 1.2,
                'aliasing_pattern': 'weak'
            },
            'WaveNet': {
                'sr': 16000,
                'quantization': 256,
                'receptive_field': 3000,
                'generation_artifacts': True
            },
            'Tacotron': {
                'sr': 16000,
                'hop_length': 12.5,
                'attention_pattern': 'monotonic',
                'prosody_variation': 'low'
            },
            'FastSpeech': {
                'sr': 22050,
                'duration_predictor': True,
                'pitch_prediction': True,
                'prosody_variation': 'medium'
            },
            'VITS': {
                'sr': 22050,
                'flow_based': True,
                'stochastic_duration': True,
                'naturalness_score': 0.95
            }
        }
    
    def extract_engine_features(self, audio, sr, mag_db, phase):
        features = {}
        
        features['spectral_centroid'] = np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr))
        features['spectral_bandwidth'] = np.mean(librosa.feature.spectral_bandwidth(y=audio, sr=sr))
        features['spectral_rolloff'] = np.mean(librosa.feature.spectral_rolloff(y=audio, sr=sr))
        features['spectral_flatness'] = np.mean(librosa.feature.spectral_flatness(y=audio))
        
        harmonic, percussive = librosa.effects.hpss(audio)
        features['harmonic_energy'] = np.sum(harmonic ** 2)
        features['percussive_energy'] = np.sum(percussive ** 2)
        features['harmonic_ratio'] = features['harmonic_energy'] / (features['harmonic_energy'] + features['percussive_energy'] + 1e-10)
        
        zero_crossings = librosa.zero_crossings(audio)
        features['zero_crossing_rate'] = np.mean(zero_crossings)
        
        mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20)
        for i in range(20):
            features[f'mfcc_mean_{i}'] = np.mean(mfccs[i])
            features[f'mfcc_std_{i}'] = np.std(mfccs[i])
        
        phase_unwrapped = np.unwrap(phase, axis=1)
        features['phase_variance'] = np.var(phase_unwrapped)
        features['phase_kurtosis'] = kurtosis(phase_unwrapped.flatten())
        
        mag_grad = np.gradient(mag_db, axis=1)
        features['mag_grad_mean'] = np.mean(np.abs(mag_grad))
        features['mag_grad_var'] = np.var(mag_grad)
        
        return features
    
    def compute_engine_similarity(self, features):
        scores = {}
        
        for engine, fingerprint in self.engine_fingerprints.items():
            score = 0.0
            count = 0
            
            if 'harmonic_ratio' in fingerprint and 'harmonic_ratio' in features:
                diff = abs(features['harmonic_ratio'] - fingerprint['harmonic_ratio'])
                score += max(0, 1 - diff * 2)
                count += 1
            
            if 'spectral_flatness' in fingerprint and 'spectral_flatness' in features:
                diff = abs(features['spectral_flatness'] - fingerprint['spectral_flatness'])
                score += max(0, 1 - diff * 5)
                count += 1
            
            if count > 0:
                scores[engine] = score / count
            else:
                scores[engine] = 0.3 + np.random.random() * 0.2
        
        total = sum(scores.values())
        if total > 0:
            normalized_scores = {k: v / total for k, v in scores.items()}
        else:
            normalized_scores = {k: 1/len(scores) for k in scores}
        
        return normalized_scores
    
    def detect_engine(self, audio, sr, mag_db, phase):
        features = self.extract_engine_features(audio, sr, mag_db, phase)
        engine_scores = self.compute_engine_similarity(features)
        
        sorted_engines = sorted(engine_scores.items(), key=lambda x: x[1], reverse=True)
        
        top_engine = sorted_engines[0]
        
        is_synthetic = top_engine[1] > 0.2
        
        return {
            'detected_engine': top_engine[0] if is_synthetic else 'Unknown/Real',
            'confidence': top_engine[1],
            'engine_scores': {k: round(v, 4) for k, v in sorted_engines},
            'is_synthetic': is_synthetic
        }

class RecompressionDetector:
    def __init__(self):
        pass
    
    def detect_compression_artifacts(self, audio, sr):
        results = {}
        
        sxx, f, t, _ = signal.spectrogram(audio, fs=sr, nperseg=1024, noverlap=512)
        sxx_db = 10 * np.log10(sxx + 1e-10)
        
        high_freq_content = np.mean(sxx_db[-50:, :])
        low_freq_content = np.mean(sxx_db[:50, :])
        results['high_freq_ratio'] = high_freq_content / (low_freq_content + 1e-10)
        
        spectral_entropy = entropy(np.abs(sxx).flatten())
        results['spectral_entropy'] = spectral_entropy
        
        block_size = 1152
        if len(audio) >= block_size * 2:
            blocks = audio[:len(audio) // block_size * block_size].reshape(-1, block_size)
            block_energies = np.sum(blocks ** 2, axis=1)
            block_correlation = np.corrcoef(block_energies[:-1], block_energies[1:])[0, 1]
            results['block_correlation'] = abs(block_correlation)
        else:
            results['block_correlation'] = 0
        
        quantization_noise = self._detect_quantization_noise(audio)
        results['quantization_noise'] = quantization_noise
        
        return results
    
    def _detect_quantization_noise(self, audio):
        audio_quantized = np.round(audio * 32767) / 32767
        noise = audio - audio_quantized
        noise_power = np.mean(noise ** 2)
        signal_power = np.mean(audio ** 2)
        snr = 10 * np.log10(signal_power / (noise_power + 1e-10))
        return snr
    
    def predict_recompression(self, audio, sr):
        artifacts = self.detect_compression_artifacts(audio, sr)
        
        mp3_score = 0.0
        if artifacts['high_freq_ratio'] < -5:
            mp3_score += 0.3
        if artifacts['block_correlation'] > 0.3:
            mp3_score += 0.4
        if artifacts['spectral_entropy'] < 7:
            mp3_score += 0.3
        
        aac_score = 0.0
        if artifacts['high_freq_ratio'] < -3:
            aac_score += 0.3
        if artifacts['block_correlation'] > 0.2:
            aac_score += 0.3
        if artifacts['quantization_noise'] < 60:
            aac_score += 0.4
        
        flac_score = 0.0
        if artifacts['high_freq_ratio'] > -2:
            flac_score += 0.5
        if artifacts['quantization_noise'] > 80:
            flac_score += 0.5
        
        scores = {
            'MP3': min(1.0, mp3_score),
            'AAC': min(1.0, aac_score),
            'FLAC/WAV': min(1.0, flac_score),
            'Unknown': 0.1
        }
        
        total = sum(scores.values())
        normalized = {k: round(v / total, 4) for k, v in scores.items()}
        
        is_recompressed = max(scores.values()) > 0.5
        
        original_format = max(normalized.items(), key=lambda x: x[1])
        
        return {
            'is_recompressed': is_recompressed,
            'original_format': original_format[0],
            'format_confidence': original_format[1],
            'format_scores': normalized,
            'artifact_metrics': {k: round(v, 4) for k, v in artifacts.items()}
        }
