import React from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { AlertTriangle, CheckCircle, Download, FileText, Target, Cpu, Activity, UserX } from 'lucide-react';
import { downloadReport, generateReport } from '../services/api';
import './DetectionResults.css';

function DetectionResults({ result, fileId }) {
  const handleDownloadReport = async () => {
    try {
      await generateReport(fileId, result);
      downloadReport(fileId);
    } catch (err) {
      console.error('生成报告失败:', err);
    }
  };

  const getRiskLevel = (prob) => {
    if (prob > 70) return { text: '高风险', color: '#dc2626', bg: '#fef2f2' };
    if (prob > 30) return { text: '中风险', color: '#d97706', bg: '#fffbeb' };
    return { text: '低风险', color: '#16a34a', bg: '#f0fdf4' };
  };

  const risk = getRiskLevel(result.overall_result.fake_probability);

  const modelScores = [
    { name: 'RawNet2', score: result.model_scores.rawnet2, fullMark: 100 },
    { name: 'LFCC+GMM', score: result.model_scores.lfcc_gmm, fullMark: 100 },
    { name: '频谱一致性', score: result.model_scores.spectral, fullMark: 100 },
    { name: 'VC检测', score: result.model_scores.vc || 0, fullMark: 100 },
  ];

  const engineScores = Object.entries(result.traceability.tts_engine.engine_scores || {})
    .map(([name, score]) => ({ name, score: (score * 100).toFixed(1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const barColors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'];

  return (
    <div className="results-container">
      <div className="results-header">
        <h2 className="results-title">检测结果</h2>
        <button className="download-btn" onClick={handleDownloadReport}>
          <Download size={18} />
          导出PDF报告
        </button>
      </div>

      <div className="results-grid">
        <div className="result-card main-result">
          <div className="card-header">
            <Target size={24} className="card-icon" />
            <h3>综合伪造概率</h3>
          </div>
          <div className="main-score">
            <div className="score-circle" style={{ color: risk.color }}>
              {result.overall_result.fake_probability.toFixed(1)}%
            </div>
            <div className="risk-badge" style={{ color: risk.color, background: risk.bg }}>
              {result.overall_result.fake_probability > 50 ? (
                <AlertTriangle size={18} />
              ) : (
                <CheckCircle size={18} />
              )}
              {risk.text}
            </div>
          </div>
          <div className="confidence-row">
            <span className="confidence-label">置信度</span>
            <div className="confidence-bar">
              <div 
                className="confidence-fill" 
                style={{ width: `${result.overall_result.confidence}%` }}
              ></div>
            </div>
            <span className="confidence-value">{result.overall_result.confidence.toFixed(1)}%</span>
          </div>
        </div>

        <div className="result-card">
          <div className="card-header">
            <Cpu size={24} className="card-icon" />
            <h3>子模型得分</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={modelScores}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  name="伪造概率"
                  dataKey="score"
                  stroke="#667eea"
                  fill="#667eea"
                  fillOpacity={0.5}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="result-card full-width">
          <div className="card-header">
            <Activity size={24} className="card-icon" />
            <h3>TTS引擎溯源分析</h3>
          </div>
          <div className="engine-results">
            <div className="engine-summary">
              <span className="engine-label">检测到的TTS引擎：</span>
              <span className="engine-name">
                {result.traceability.tts_engine.detected_engine}
                <span className="engine-confidence">
                  ({(result.traceability.tts_engine.confidence * 100).toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className="chart-container bar-chart">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={engineScores} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value) => [`${value}%`, '匹配度']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                    {engineScores.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="result-card">
          <div className="card-header">
            <UserX size={24} className="card-icon" style={{ color: '#f59e0b' }} />
            <h3>声音身份替换检测</h3>
          </div>
          {result.vc_detection ? (
            <div className="vc-result">
              <div className="vc-main-indicator">
                <span className="vc-prob-label">VC替换概率</span>
                <span 
                  className="vc-prob-value"
                  style={{ color: result.vc_detection.vc_probability > 0.5 ? '#dc2626' : '#16a34a' }}
                >
                  {(result.vc_detection.vc_probability * 100).toFixed(1)}%
                </span>
              </div>
              <div className={`vc-status-badge ${result.vc_detection.identity_replaced ? 'replaced' : 'safe'}`}>
                {result.vc_detection.identity_replaced ? (
                  <><AlertTriangle size={16} /> 检测到声音身份替换</>
                ) : (
                  <><CheckCircle size={16} /> 声音身份一致</>
                )}
              </div>
              {result.vc_detection.interpretation && (
                <div className="vc-interp-grid">
                  {Object.entries(result.vc_detection.interpretation).map(([key, value]) => (
                    <div key={key} className={`vc-interp-item ${value === 'depleted' || value === 'shifted_low' || value === 'vc_like' ? 'warn' : 'ok'}`}>
                      <span className="vc-interp-key">
                        {key === 'hf_ratio_status' ? '高频成分' :
                         key === 'centroid_status' ? '频谱质心' :
                         key === 'kurtosis_status' ? '残差峰度' : key}
                      </span>
                      <span className="vc-interp-val">
                        {value === 'normal' ? '正常' :
                         value === 'depleted' ? '缺失' :
                         value === 'shifted_low' ? '偏低' :
                         value === 'natural' ? '自然' :
                         value === 'vc_like' ? 'VC特征' : value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {result.vc_detection.metrics && (
                <div className="vc-metrics">
                  {result.vc_detection.metrics.hf_ratio != null && (
                    <div className="vc-metric-item">
                      <span className="metric-name">高频比</span>
                      <span className="metric-value">{result.vc_detection.metrics.hf_ratio.toFixed(4)}</span>
                    </div>
                  )}
                  {result.vc_detection.metrics.spectral_centroid != null && (
                    <div className="vc-metric-item">
                      <span className="metric-name">频谱质心</span>
                      <span className="metric-value">{result.vc_detection.metrics.spectral_centroid.toFixed(1)} Hz</span>
                    </div>
                  )}
                  {result.vc_detection.metrics.residual_kurtosis != null && (
                    <div className="vc-metric-item">
                      <span className="metric-name">残差峰度</span>
                      <span className="metric-value">{result.vc_detection.metrics.residual_kurtosis.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="vc-result">
              <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>VC检测数据不可用</p>
            </div>
          )}
        </div>

        <div className="result-card">
          <div className="card-header">
            <FileText size={24} className="card-icon" />
            <h3>重压缩检测</h3>
          </div>
          <div className="recompression-result">
            <div className="format-badge">
              <span className="format-label">原始格式推测</span>
              <span className="format-value">{result.traceability.recompression.original_format}</span>
              <span className="format-confidence">
                {(result.traceability.recompression.format_confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className={`recompressed-badge ${result.traceability.recompression.is_recompressed ? 'yes' : 'no'}`}>
              {result.traceability.recompression.is_recompressed ? '检测到重压缩痕迹' : '未检测到重压缩'}
            </div>
            <div className="format-scores">
              {Object.entries(result.traceability.recompression.format_scores || {}).map(([format, score]) => (
                <div key={format} className="format-score-item">
                  <span className="format-name">{format}</span>
                  <div className="format-score-bar">
                    <div 
                      className="format-score-fill" 
                      style={{ width: `${score * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="result-card">
          <div className="card-header">
            <Activity size={24} className="card-icon" />
            <h3>音频信息</h3>
          </div>
          <div className="audio-info">
            <div className="info-item">
              <span className="info-label">时长</span>
              <span className="info-value">{result.duration.toFixed(2)} 秒</span>
            </div>
            <div className="info-item">
              <span className="info-label">采样率</span>
              <span className="info-value">{result.sample_rate} Hz</span>
            </div>
            <div className="info-item">
              <span className="info-label">可疑区域</span>
              <span className="info-value">{result.localization.suspicious_segments.length} 处</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DetectionResults;
