import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Radio, Square, AlertTriangle, CheckCircle, Activity, Shield, UserX, TrendingUp } from 'lucide-react';
import './StreamingMonitor.css';

const WS_BASE = 'ws://localhost:8000/api/streaming/ws/stream';
const TARGET_SR = 16000;
const SCRIPT_BUFFER_SIZE = 4096;

function StreamingMonitor() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [detectionHistory, setDetectionHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [currentResult, setCurrentResult] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState('');
  
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const timerRef = useRef(null);
  const historyRef = useRef([]);
  const isStreamingRef = useRef(false);

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  const startStreaming = useCallback(async () => {
    try {
      setError('');
      setDetectionHistory([]);
      setAlerts([]);
      setCurrentResult(null);
      historyRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: TARGET_SR,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: TARGET_SR
      });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      const processor = audioContext.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1);
      processorRef.current = processor;
      
      const ws = new WebSocket(WS_BASE);
      wsRef.current = ws;
      
      ws.onopen = () => {
        isStreamingRef.current = true;
        setIsStreaming(true);
        setElapsedTime(0);
        
        timerRef.current = setInterval(() => {
          setElapsedTime(prev => prev + 1);
        }, 1000);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          console.error('解析消息失败:', e);
        }
      };
      
      ws.onerror = () => {
        setError('WebSocket连接失败');
        stopStreaming();
      };
      
      ws.onclose = () => {
        if (isStreamingRef.current) {
          isStreamingRef.current = false;
          setIsStreaming(false);
        }
      };
      
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, Math.round(inputData[i] * 32768)));
          }
          ws.send(int16Data.buffer);
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
    } catch (err) {
      setError('无法启动麦克风流: ' + err.message);
      console.error(err);
    }
  }, []);

  const stopStreaming = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const handleMessage = useCallback((data) => {
    switch (data.type) {
      case 'session_start':
        setSessionId(data.session_id);
        break;
      
      case 'detection_result':
        setCurrentResult(data);
        historyRef.current = [...historyRef.current, data];
        if (historyRef.current.length > 50) {
          historyRef.current = historyRef.current.slice(-50);
        }
        setDetectionHistory([...historyRef.current]);
        break;
      
      case 'alert':
        setAlerts(prev => {
          const newAlerts = [data, ...prev].slice(0, 30);
          return newAlerts;
        });
        break;
      
      case 'ping':
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'pong' }));
        }
        break;
      
      case 'error':
        setError(data.message);
        break;
      
      default:
        break;
    }
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getRiskColor = (prob) => {
    if (prob > 70) return '#dc2626';
    if (prob > 30) return '#d97706';
    return '#16a34a';
  };

  const getRiskBg = (prob) => {
    if (prob > 70) return '#fef2f2';
    if (prob > 30) return '#fffbeb';
    return '#f0fdf4';
  };

  return (
    <div className="streaming-container">
      <div className="streaming-card">
        <div className="streaming-header">
          <div className="header-left">
            <Radio size={24} className="streaming-icon" />
            <div>
              <h2 className="streaming-title">直播流式监控</h2>
              <p className="streaming-subtitle">WebRTC 接流 · 3秒滑动窗口 · 持续监控</p>
            </div>
          </div>
          <div className="header-right">
            {isStreaming && (
              <div className="live-badge">
                <span className="live-dot"></span>
                LIVE
              </div>
            )}
          </div>
        </div>

        <div className="control-section">
          <div className="status-bar">
            <div className="status-item">
              <span className="status-label">状态</span>
              <span className={`status-value ${isStreaming ? 'active' : 'inactive'}`}>
                {isStreaming ? '监控中' : '未启动'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">运行时间</span>
              <span className="status-value mono">{formatTime(elapsedTime)}</span>
            </div>
            <div className="status-item">
              <span className="status-label">检测窗口</span>
              <span className="status-value">{detectionHistory.length}</span>
            </div>
            <div className="status-item">
              <span className="status-label">告警</span>
              <span className={`status-value ${alerts.length > 0 ? 'alert' : ''}`}>{alerts.length}</span>
            </div>
          </div>

          <div className="stream-buttons">
            {!isStreaming ? (
              <button className="stream-btn start" onClick={startStreaming}>
                <Radio size={20} />
                开始监控
              </button>
            ) : (
              <button className="stream-btn stop" onClick={stopStreaming}>
                <Square size={20} />
                停止监控
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {currentResult && (
          <div className="current-detection">
            <div className="detection-main">
              <div className="detection-gauge">
                <div 
                  className="gauge-circle"
                  style={{ 
                    background: `conic-gradient(${getRiskColor(currentResult.fake_probability)} ${currentResult.fake_probability}%, #e5e7eb ${currentResult.fake_probability}%)`
                  }}
                >
                  <div className="gauge-inner">
                    <span className="gauge-value" style={{ color: getRiskColor(currentResult.fake_probability) }}>
                      {currentResult.fake_probability.toFixed(1)}%
                    </span>
                    <span className="gauge-label">伪造概率</span>
                  </div>
                </div>
              </div>
              
              <div className="detection-details">
                <div className="detail-row">
                  <Shield size={16} />
                  <span className="detail-label">风险等级</span>
                  <span 
                    className="risk-tag"
                    style={{ 
                      color: getRiskColor(currentResult.fake_probability),
                      background: getRiskBg(currentResult.fake_probability)
                    }}
                  >
                    {currentResult.risk_level === 'high' ? '高风险' : 
                     currentResult.risk_level === 'medium' ? '中风险' : '低风险'}
                  </span>
                </div>
                
                {currentResult.vc_detection && (
                  <div className="detail-row vc-row">
                    <UserX size={16} />
                    <span className="detail-label">声音身份替换</span>
                    <span className={`vc-tag ${currentResult.vc_detection.identity_replaced ? 'detected' : 'safe'}`}>
                      {currentResult.vc_detection.identity_replaced ? '⚠ 检测到VC替换' : '✓ 身份一致'}
                    </span>
                  </div>
                )}
                
                <div className="model-scores-mini">
                  {currentResult.model_scores && Object.entries(currentResult.model_scores).map(([name, score]) => (
                    <div key={name} className="mini-score">
                      <span className="mini-name">{name.toUpperCase()}</span>
                      <div className="mini-bar">
                        <div 
                          className="mini-fill"
                          style={{ 
                            width: `${score}%`,
                            background: getRiskColor(score)
                          }}
                        ></div>
                      </div>
                      <span className="mini-value">{score.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {currentResult.vc_detection && currentResult.vc_detection.interpretation && (
              <div className="vc-interpretation">
                <div className="interp-header">
                  <Activity size={14} />
                  <span>逆音素残差分析</span>
                </div>
                <div className="interp-grid">
                  {Object.entries(currentResult.vc_detection.interpretation).map(([key, value]) => (
                    <div key={key} className={`interp-item ${value === 'depleted' || value === 'shifted_low' || value === 'vc_like' ? 'warning' : 'ok'}`}>
                      <span className="interp-key">
                        {key === 'hf_ratio_status' ? '高频成分' :
                         key === 'centroid_status' ? '频谱质心' :
                         key === 'kurtosis_status' ? '残差峰度' : key}
                      </span>
                      <span className="interp-value">
                        {value === 'normal' ? '正常' :
                         value === 'depleted' ? '缺失' :
                         value === 'shifted_low' ? '偏低' :
                         value === 'natural' ? '自然' :
                         value === 'vc_like' ? 'VC特征' : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="history-section">
          <div className="section-header">
            <h3>
              <TrendingUp size={16} />
              检测趋势
            </h3>
            <span className="history-count">{detectionHistory.length} 窗口</span>
          </div>
          
          <div className="trend-chart">
            {detectionHistory.length > 0 ? (
              <div className="trend-bars">
                {detectionHistory.slice(-30).map((item, idx) => (
                  <div key={idx} className="trend-bar-wrapper">
                    <div 
                      className="trend-bar"
                      style={{ 
                        height: `${Math.max(4, item.fake_probability)}%`,
                        background: getRiskColor(item.fake_probability)
                      }}
                      title={`${item.window_end}s: ${item.fake_probability.toFixed(1)}%`}
                    ></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="trend-empty">等待检测数据...</div>
            )}
            <div className="trend-axis">
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="alerts-section">
            <div className="section-header">
              <h3 className="alerts-title">
                <AlertTriangle size={16} />
                实时告警
              </h3>
            </div>
            <div className="alerts-list">
              {alerts.slice(0, 10).map((alert, idx) => (
                <div key={idx} className={`alert-item ${alert.alert_type}`}>
                  <div className="alert-icon-wrap">
                    {alert.alert_type === 'voice_conversion' ? (
                      <UserX size={16} />
                    ) : (
                      <AlertTriangle size={16} />
                    )}
                  </div>
                  <div className="alert-content">
                    <span className="alert-message">{alert.message}</span>
                    <span className="alert-time">{alert.window_end?.toFixed(1)}s</span>
                  </div>
                  <div className="alert-scores">
                    {alert.fake_probability != null && (
                      <span className="alert-score">伪造: {alert.fake_probability.toFixed(1)}%</span>
                    )}
                    {alert.vc_probability != null && (
                      <span className="alert-score vc">VC: {alert.vc_probability.toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StreamingMonitor;
