import asyncio
import json
import numpy as np
import torch
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from collections import deque
import time

from utils.audio_utils import compute_lfcc, compute_spectrogram, compute_phase_spectrum
from models.rawnet2 import predict_rawnet2
from models.lfcc_gmm import LFCCGMMDetector
from models.spectral_detector import SpectralConsistencyDetector
from models.ensemble_localizer import EnsembleDetector, ForgeryLocalizer
from models.vc_detector import VCDetector

router = APIRouter()

lfcc_gmm_detector = LFCCGMMDetector()
spectral_detector = SpectralConsistencyDetector()
ensemble_detector = EnsembleDetector()
forgery_localizer = ForgeryLocalizer()
vc_detector = VCDetector()

try:
    from models.rawnet2 import load_rawnet2_model
    rawnet2_model = load_rawnet2_model()
    rawnet2_available = True
except Exception:
    rawnet2_model = None
    rawnet2_available = False

WINDOW_DURATION = 3
SR = 16000
WINDOW_SAMPLES = WINDOW_DURATION * SR
HOP_SAMPLES = int(1.0 * SR)
PING_INTERVAL = 30
PROCESSING_TIMEOUT = 10


class StreamSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.buffer = np.array([], dtype=np.float32)
        self.detection_history = deque(maxlen=100)
        self.start_time = time.time()
        self.total_frames = 0
        self.alerts = deque(maxlen=50)
        self.last_process_pos = 0
        self.is_processing = False
        self.last_ping = time.time()
    
    def add_audio(self, audio_chunk: np.ndarray):
        self.buffer = np.concatenate([self.buffer, audio_chunk.flatten()])
        
        max_buffer = WINDOW_SAMPLES + SR * 30
        if len(self.buffer) > max_buffer:
            excess = len(self.buffer) - max_buffer
            self.buffer = self.buffer[excess:]
            self.last_process_pos = max(0, self.last_process_pos - excess)
    
    def should_process(self) -> bool:
        if self.is_processing:
            return False
        available = len(self.buffer) - self.last_process_pos
        return available >= WINDOW_SAMPLES
    
    def get_window(self) -> np.ndarray:
        start = self.last_process_pos
        end = start + WINDOW_SAMPLES
        window = self.buffer[start:end]
        self.last_process_pos += HOP_SAMPLES
        return window
    
    def get_elapsed_time(self) -> float:
        return time.time() - self.start_time


def _analyze_window_sync(audio_window: np.ndarray, sr: int = SR):
    results = {}
    
    try:
        audio_tensor = torch.from_numpy(audio_window).float()
        rawnet2_score, rawnet2_attn = predict_rawnet2(rawnet2_model, audio_tensor)
        results['rawnet2'] = rawnet2_score
        results['rawnet2_attn'] = rawnet2_attn
    except Exception:
        results['rawnet2'] = 0.5
        results['rawnet2_attn'] = np.ones(10) * 0.5
    
    try:
        lfcc_features = compute_lfcc(audio_window, sr)
        lfcc_gmm_score, lfcc_frame_scores = lfcc_gmm_detector.predict(lfcc_features)
        results['lfcc_gmm'] = lfcc_gmm_score
        results['lfcc_frame_scores'] = lfcc_frame_scores
    except Exception:
        results['lfcc_gmm'] = 0.5
        results['lfcc_frame_scores'] = np.ones(10) * 0.5
    
    try:
        mag_db, phase, D = compute_spectrogram(audio_window, sr)
        _, phase_derivative = compute_phase_spectrum(audio_window, sr)
        spectral_score, spectral_frame_scores = spectral_detector.predict(
            audio_window, sr, mag_db, phase, phase_derivative
        )
        results['spectral'] = spectral_score
        results['spectral_frame_scores'] = spectral_frame_scores
    except Exception:
        results['spectral'] = 0.5
        results['spectral_frame_scores'] = np.ones(10) * 0.5
    
    try:
        vc_result = vc_detector.detect_vc(audio_window)
        results['vc'] = vc_result
        results['vc_score'] = vc_result['vc_probability']
    except Exception:
        results['vc'] = {
            'vc_probability': 0.5,
            'is_voice_converted': False,
            'identity_replaced': False,
            'metrics': {},
            'interpretation': {},
            'frame_scores': []
        }
        results['vc_score'] = 0.5
    
    ensemble_score, confidence = ensemble_detector.ensemble_predict_with_vc(
        results.get('rawnet2', 0.5),
        results.get('lfcc_gmm', 0.5),
        results.get('spectral', 0.5),
        results.get('vc_score', 0.5)
    )
    
    results['ensemble_score'] = ensemble_score
    results['confidence'] = confidence
    
    return results


@router.websocket("/ws/stream")
async def stream_detection(websocket: WebSocket):
    await websocket.accept()
    
    import uuid
    session_id = str(uuid.uuid4())
    session = StreamSession(session_id)
    
    await websocket.send_json({
        'type': 'session_start',
        'session_id': session_id,
        'config': {
            'window_duration': WINDOW_DURATION,
            'sample_rate': SR,
            'hop_duration': 1.0
        }
    })
    
    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_bytes(),
                    timeout=0.1
                )
                
                audio_chunk = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                session.add_audio(audio_chunk)
                session.last_ping = time.time()
                
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                break
            
            if time.time() - session.last_ping > PING_INTERVAL:
                try:
                    await websocket.send_json({'type': 'ping'})
                    session.last_ping = time.time()
                except Exception:
                    break
            
            while session.should_process():
                window = session.get_window()
                session.is_processing = True
                
                try:
                    results = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(
                            None, _analyze_window_sync, window
                        ),
                        timeout=PROCESSING_TIMEOUT
                    )
                except asyncio.TimeoutError:
                    session.is_processing = False
                    continue
                except Exception:
                    session.is_processing = False
                    continue
                
                session.is_processing = False
                
                elapsed = session.get_elapsed_time()
                window_start = max(0, elapsed - WINDOW_DURATION)
                
                vc_result = results.get('vc', {})
                
                detection_event = {
                    'type': 'detection_result',
                    'timestamp': time.time(),
                    'window_start': round(window_start, 2),
                    'window_end': round(elapsed, 2),
                    'fake_probability': round(results['ensemble_score'] * 100, 2),
                    'confidence': round(results['confidence'] * 100, 2),
                    'is_fake': results['ensemble_score'] > 0.5,
                    'risk_level': 'high' if results['ensemble_score'] > 0.7 else ('medium' if results['ensemble_score'] > 0.3 else 'low'),
                    'model_scores': {
                        'rawnet2': round(results.get('rawnet2', 0.5) * 100, 2),
                        'lfcc_gmm': round(results.get('lfcc_gmm', 0.5) * 100, 2),
                        'spectral': round(results.get('spectral', 0.5) * 100, 2),
                        'vc': round(results.get('vc_score', 0.5) * 100, 2)
                    },
                    'vc_detection': {
                        'vc_probability': round(vc_result.get('vc_probability', 0), 4),
                        'is_voice_converted': vc_result.get('is_voice_converted', False),
                        'identity_replaced': vc_result.get('identity_replaced', False),
                        'interpretation': vc_result.get('interpretation', {})
                    },
                    'session_id': session_id
                }
                
                session.detection_history.append(detection_event)
                session.total_frames += 1
                
                if results['ensemble_score'] > 0.7 or vc_result.get('vc_probability', 0) > 0.6:
                    alert = {
                        'type': 'alert',
                        'alert_type': 'high_fake_probability' if results['ensemble_score'] > 0.7 else 'voice_conversion',
                        'timestamp': time.time(),
                        'window_start': round(window_start, 2),
                        'window_end': round(elapsed, 2),
                        'fake_probability': round(results['ensemble_score'] * 100, 2),
                        'vc_probability': round(vc_result.get('vc_probability', 0) * 100, 2),
                        'message': f"检测到高风险: 伪造概率 {results['ensemble_score']*100:.1f}%" if results['ensemble_score'] > 0.7 else f"检测到声音身份替换: VC概率 {vc_result.get('vc_probability', 0)*100:.1f}%"
                    }
                    session.alerts.append(alert)
                    try:
                        await websocket.send_json(alert)
                    except Exception:
                        break
                
                try:
                    await websocket.send_json(detection_event)
                except Exception:
                    break
            
            await asyncio.sleep(0.05)
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                'type': 'error',
                'message': str(e)
            })
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.get("/stream/status/{session_id}")
async def get_stream_status(session_id: str):
    return {
        'session_id': session_id,
        'status': 'active',
        'window_duration': WINDOW_DURATION,
        'sample_rate': SR,
        'hop_duration': 1.0
    }
