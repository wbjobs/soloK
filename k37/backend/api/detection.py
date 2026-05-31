from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import torch
import numpy as np
import uuid

from utils.audio_utils import load_audio, compute_lfcc, compute_spectrogram, compute_phase_spectrum
from models.rawnet2 import load_rawnet2_model, predict_rawnet2
from models.lfcc_gmm import LFCCGMMDetector
from models.spectral_detector import SpectralConsistencyDetector
from models.ensemble_localizer import EnsembleDetector, ForgeryLocalizer
from models.traceability import TTSEngineDetector, RecompressionDetector
from models.vc_detector import VCDetector

router = APIRouter()

rawnet2_model = load_rawnet2_model()
lfcc_gmm_detector = LFCCGMMDetector()
spectral_detector = SpectralConsistencyDetector()
ensemble_detector = EnsembleDetector()
forgery_localizer = ForgeryLocalizer()
tts_engine_detector = TTSEngineDetector()
recompression_detector = RecompressionDetector()
vc_detector = VCDetector()

UPLOAD_DIR = Path("uploads")

@router.post("/analyze")
async def analyze_audio(file_id: str = Query(..., description="上传文件ID")):
    try:
        wav_path = list(UPLOAD_DIR.glob(f"{file_id}.*"))
        if not wav_path:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        file_path = str(wav_path[0])
        
        audio, sr, duration = load_audio(file_path, target_sr=16000, max_duration=60)
        
        audio_tensor = torch.from_numpy(audio).float()
        
        rawnet2_score, rawnet2_attn = predict_rawnet2(rawnet2_model, audio_tensor)
        
        lfcc_features = compute_lfcc(audio, sr)
        lfcc_gmm_score, lfcc_frame_scores = lfcc_gmm_detector.predict(lfcc_features)
        
        mag_db, phase, D = compute_spectrogram(audio, sr)
        _, phase_derivative = compute_phase_spectrum(audio, sr)
        spectral_score, spectral_frame_scores = spectral_detector.predict(audio, sr, mag_db, phase, phase_derivative)
        
        vc_result = vc_detector.detect_vc(audio)
        vc_score = vc_result['vc_probability']
        
        ensemble_score, confidence = ensemble_detector.ensemble_predict_with_vc(
            rawnet2_score, lfcc_gmm_score, spectral_score, vc_score
        )
        
        frame_scores, suspicious_frames, threshold = forgery_localizer.localize_frames(
            rawnet2_attn, lfcc_frame_scores, spectral_frame_scores, len(audio), audio=audio
        )
        
        suspicious_segments = forgery_localizer.find_suspicious_segments(suspicious_frames)
        
        heatmap = forgery_localizer.generate_heatmap_data(frame_scores, mag_db.shape[1])
        
        engine_result = tts_engine_detector.detect_engine(audio, sr, mag_db, phase)
        
        recompression_result = recompression_detector.predict_recompression(audio, sr)
        
        return {
            'file_id': file_id,
            'duration': round(duration, 2),
            'sample_rate': sr,
            'overall_result': {
                'fake_probability': round(ensemble_score * 100, 2),
                'confidence': round(confidence * 100, 2),
                'is_fake': ensemble_score > 0.5,
                'risk_level': 'high' if ensemble_score > 0.7 else ('medium' if ensemble_score > 0.3 else 'low')
            },
            'model_scores': {
                'rawnet2': round(rawnet2_score * 100, 2),
                'lfcc_gmm': round(lfcc_gmm_score * 100, 2),
                'spectral': round(spectral_score * 100, 2),
                'vc': round(vc_result['vc_probability'] * 100, 2)
            },
            'vc_detection': {
                'vc_probability': vc_result['vc_probability'],
                'is_voice_converted': vc_result['is_voice_converted'],
                'identity_replaced': vc_result['identity_replaced'],
                'metrics': vc_result['metrics'],
                'interpretation': vc_result['interpretation']
            },
            'localization': {
                'suspicious_segments': suspicious_segments,
                'frame_scores': frame_scores.tolist(),
                'heatmap': heatmap.tolist(),
                'threshold': float(threshold)
            },
            'traceability': {
                'tts_engine': engine_result,
                'recompression': recompression_result
            },
            'spectrogram': {
                'data': mag_db.tolist(),
                'shape': mag_db.shape
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

@router.post("/realtime")
async def realtime_detection(audio_data: dict):
    try:
        import base64
        import io
        import soundfile as sf
        
        audio_bytes = base64.b64decode(audio_data['audio_base64'])
        audio, sr = sf.read(io.BytesIO(audio_bytes))
        
        if len(audio.shape) > 1:
            audio = np.mean(audio, axis=1)
        
        if sr != 16000:
            import librosa as lr
            audio = lr.resample(audio, orig_sr=sr, target_sr=16000)
            sr = 16000
        
        audio_tensor = torch.from_numpy(audio.astype(np.float32)).float()
        
        rawnet2_score, rawnet2_attn = predict_rawnet2(rawnet2_model, audio_tensor)
        
        lfcc_features = compute_lfcc(audio, sr)
        lfcc_gmm_score, lfcc_frame_scores = lfcc_gmm_detector.predict(lfcc_features)
        
        mag_db, phase, D = compute_spectrogram(audio, sr)
        _, phase_derivative = compute_phase_spectrum(audio, sr)
        spectral_score, spectral_frame_scores = spectral_detector.predict(audio, sr, mag_db, phase, phase_derivative)
        
        vc_result = vc_detector.detect_vc(audio)
        vc_score = vc_result['vc_probability']
        
        ensemble_score, confidence = ensemble_detector.ensemble_predict_with_vc(
            rawnet2_score, lfcc_gmm_score, spectral_score, vc_score
        )
        
        frame_scores, suspicious_frames, threshold = forgery_localizer.localize_frames(
            rawnet2_attn, lfcc_frame_scores, spectral_frame_scores, len(audio), audio=audio
        )
        
        suspicious_segments = forgery_localizer.find_suspicious_segments(suspicious_frames)
        
        return {
            'fake_probability': round(ensemble_score * 100, 2),
            'confidence': round(confidence * 100, 2),
            'is_fake': ensemble_score > 0.5,
            'model_scores': {
                'rawnet2': round(rawnet2_score * 100, 2),
                'lfcc_gmm': round(lfcc_gmm_score * 100, 2),
                'spectral': round(spectral_score * 100, 2),
                'vc': round(vc_result['vc_probability'] * 100, 2)
            },
            'vc_detection': {
                'vc_probability': vc_result['vc_probability'],
                'is_voice_converted': vc_result['is_voice_converted'],
                'identity_replaced': vc_result['identity_replaced'],
                'interpretation': vc_result['interpretation']
            },
            'suspicious_segments': suspicious_segments
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"实时检测失败: {str(e)}")
