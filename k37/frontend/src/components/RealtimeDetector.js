import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Play, Square, AlertTriangle, CheckCircle, Loader2, UserX } from 'lucide-react';
import { realtimeDetection } from '../services/api';
import './RealtimeDetector.css';

function RealtimeDetector() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [detectionResult, setDetectionResult] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      setError('');
      setDetectionResult(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        analyzeAudio(audioBlob);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 10) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (err) {
      setError('无法访问麦克风，请检查权限设置');
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const analyzeAudio = async (audioBlob) => {
    setIsAnalyzing(true);
    
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];
        const result = await realtimeDetection(base64Data);
        setDetectionResult(result);
        setIsAnalyzing(false);
      };
    } catch (err) {
      setError('分析失败，请重试');
      setIsAnalyzing(false);
      console.error(err);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getRiskColor = (prob) => {
    if (prob > 70) return '#dc2626';
    if (prob > 30) return '#d97706';
    return '#16a34a';
  };

  return (
    <div className="realtime-container">
      <div className="realtime-card">
        <div className="realtime-header">
          <h2 className="realtime-title">实时麦克风检测</h2>
          <p className="realtime-subtitle">录制一段语音（最长10秒），即时检测是否为伪造</p>
        </div>

        <div className="recording-section">
          <div className={`record-circle ${isRecording ? 'recording' : ''}`}>
            {isRecording ? (
              <Mic size={40} className="record-icon active" />
            ) : (
              <Mic size={40} className="record-icon" />
            )}
          </div>
          
          <div className="recording-time">
            {formatTime(recordingTime)}
          </div>
          
          {isRecording && (
            <div className="recording-indicator">
              <span className="recording-dot"></span>
              正在录音...
            </div>
          )}
        </div>

        <div className="action-buttons">
          {!isRecording && !isAnalyzing && (
            <button className="record-btn start" onClick={startRecording}>
              <Mic size={20} />
              开始录音
            </button>
          )}
          
          {isRecording && (
            <button className="record-btn stop" onClick={stopRecording}>
              <Square size={20} />
              停止录音
            </button>
          )}
          
          {isAnalyzing && (
            <div className="analyzing-status">
              <Loader2 size={24} className="spinning" />
              正在分析...
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {audioUrl && !isAnalyzing && (
          <div className="audio-preview">
            <h4>录音预览</h4>
            <audio controls src={audioUrl} className="audio-player" />
          </div>
        )}

        {detectionResult && (
          <div className="detection-result">
            <div className="result-header">
              <h4>检测结果</h4>
              {detectionResult.is_fake ? (
                <div className="result-badge fake">
                  <AlertTriangle size={18} />
                  疑似伪造
                </div>
              ) : (
                <div className="result-badge real">
                  <CheckCircle size={18} />
                  真实语音
                </div>
              )}
            </div>
            
            <div className="fake-probability">
              <span className="prob-label">伪造概率</span>
              <span 
                className="prob-value"
                style={{ color: getRiskColor(detectionResult.fake_probability) }}
              >
                {detectionResult.fake_probability.toFixed(1)}%
              </span>
            </div>
            
            <div className="model-breakdown">
              <div className="breakdown-title">模型得分</div>
              <div className="breakdown-grid">
                <div className="breakdown-item">
                  <span className="model-name">RawNet2</span>
                  <div className="model-bar">
                    <div 
                      className="model-fill" 
                      style={{ width: `${detectionResult.model_scores.rawnet2}%` }}
                    ></div>
                  </div>
                  <span className="model-score">{detectionResult.model_scores.rawnet2.toFixed(1)}%</span>
                </div>
                <div className="breakdown-item">
                  <span className="model-name">LFCC+GMM</span>
                  <div className="model-bar">
                    <div 
                      className="model-fill" 
                      style={{ width: `${detectionResult.model_scores.lfcc_gmm}%` }}
                    ></div>
                  </div>
                  <span className="model-score">{detectionResult.model_scores.lfcc_gmm.toFixed(1)}%</span>
                </div>
                <div className="breakdown-item">
                  <span className="model-name">频谱一致性</span>
                  <div className="model-bar">
                    <div 
                      className="model-fill" 
                      style={{ width: `${detectionResult.model_scores.spectral}%` }}
                    ></div>
                  </div>
                  <span className="model-score">{detectionResult.model_scores.spectral.toFixed(1)}%</span>
                </div>
                {detectionResult.model_scores.vc != null && (
                  <div className="breakdown-item vc-breakdown">
                    <span className="model-name">VC检测</span>
                    <div className="model-bar">
                      <div 
                        className="model-fill vc-fill" 
                        style={{ width: `${detectionResult.model_scores.vc}%` }}
                      ></div>
                    </div>
                    <span className="model-score">{detectionResult.model_scores.vc.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>
            
            {detectionResult.vc_detection && (
              <div className="vc-detection-mini">
                <div className="vc-mini-header">
                  <UserX size={16} />
                  <span>声音身份替换检测</span>
                </div>
                <div className="vc-mini-content">
                  <span className={`vc-mini-status ${detectionResult.vc_detection.identity_replaced ? 'replaced' : 'safe'}`}>
                    {detectionResult.vc_detection.identity_replaced ? '⚠ 检测到VC替换' : '✓ 身份一致'}
                  </span>
                  <span className="vc-mini-prob">
                    {(detectionResult.vc_detection.vc_probability * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RealtimeDetector;
