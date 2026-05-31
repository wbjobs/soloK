import React, { useState, useEffect } from 'react';
import { UserPlus, UserCheck, Upload, Trash2, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { registerSpeaker, verifySpeaker, getRegisteredSpeakers, uploadAudio, analyzeAudio } from '../services/api';
import './SpeakerVerification.css';

function SpeakerVerification() {
  const [activeTab, setActiveTab] = useState('register');
  const [speakerId, setSpeakerId] = useState('');
  const [registerFile, setRegisterFile] = useState(null);
  const [verifyFileId, setVerifyFileId] = useState(null);
  const [verifyAudioUrl, setVerifyAudioUrl] = useState(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [registeredSpeakers, setRegisteredSpeakers] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSpeakers();
  }, []);

  const loadSpeakers = async () => {
    try {
      const data = await getRegisteredSpeakers();
      setRegisteredSpeakers(data.speakers || {});
    } catch (err) {
      console.error('加载说话人列表失败:', err);
    }
  };

  const handleRegister = async () => {
    if (!speakerId.trim()) {
      setError('请输入说话人ID');
      return;
    }
    if (!registerFile) {
      setError('请选择音频文件');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      await registerSpeaker(speakerId.trim(), registerFile);
      setSuccess('注册成功！');
      setSpeakerId('');
      setRegisterFile(null);
      loadSpeakers();
    } catch (err) {
      setError(err.response?.data?.detail || '注册失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const uploadResult = await uploadAudio(file);
      setVerifyFileId(uploadResult.file_id);
      setVerifyAudioUrl(URL.createObjectURL(file));
      setResult(null);
    } catch (err) {
      setError('文件上传失败');
    }
  };

  const handleVerify = async () => {
    if (!verifyFileId) {
      setError('请选择要验证的音频文件');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const analysisResult = await analyzeAudio(verifyFileId);
      const verifyResult = await verifySpeaker(
        verifyFileId, 
        selectedSpeaker || null
      );

      setResult({
        speaker: verifyResult,
        analysis: analysisResult
      });
    } catch (err) {
      setError(err.response?.data?.detail || '验证失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSpeaker = async (spkId) => {
    try {
      loadSpeakers();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  const tabs = [
    { id: 'register', label: '声纹注册', icon: UserPlus },
    { id: 'verify', label: '说话人验证', icon: UserCheck },
  ];

  return (
    <div className="speaker-container">
      <div className="speaker-card">
        <div className="speaker-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`speaker-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
                setSuccess('');
                setResult(null);
              }}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'register' && (
          <div className="tab-content">
            <div className="form-group">
              <label className="form-label">说话人ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="例如: speaker_001"
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">上传注册音频</label>
              <div className="file-upload">
                <label className="upload-label">
                  <Upload size={24} />
                  <span>{registerFile ? registerFile.name : '点击选择音频文件'}</span>
                  <input
                    type="file"
                    accept=".wav,.mp3,.flac"
                    onChange={(e) => setRegisterFile(e.target.files[0])}
                    hidden
                  />
                </label>
              </div>
              <p className="form-hint">支持 WAV/MP3/FLAC 格式，建议时长 2-10 秒</p>
            </div>

            {error && (
              <div className="message error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {success && (
              <div className="message success">
                <CheckCircle size={16} />
                {success}
              </div>
            )}

            <button
              className="action-btn primary"
              onClick={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 size={18} className="spinning" />
              ) : (
                <UserPlus size={18} />
              )}
              注册声纹
            </button>
          </div>
        )}

        {activeTab === 'verify' && (
          <div className="tab-content">
            <div className="form-group">
              <label className="form-label">选择验证目标（可选）</label>
              <select
                className="form-select"
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
              >
                <option value="">自动匹配所有注册说话人</option>
                {Object.entries(registeredSpeakers).map(([id, count]) => (
                  <option key={id} value={id}>
                    {id} ({count} 条样本)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">上传待验证音频</label>
              <div className="file-upload">
                <label className="upload-label">
                  <Upload size={24} />
                  <span>{verifyFileId ? '已选择音频文件' : '点击选择音频文件'}</span>
                  <input
                    type="file"
                    accept=".wav,.mp3,.flac"
                    onChange={handleVerifyFileSelect}
                    hidden
                  />
                </label>
              </div>
            </div>

            {verifyAudioUrl && (
              <div className="audio-preview-small">
                <audio controls src={verifyAudioUrl} />
              </div>
            )}

            {error && (
              <div className="message error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              className="action-btn primary"
              onClick={handleVerify}
              disabled={isLoading || !verifyFileId}
            >
              {isLoading ? (
                <Loader2 size={18} className="spinning" />
              ) : (
                <UserCheck size={18} />
              )}
              开始验证
            </button>

            {result && (
              <div className="verify-result">
                <h4 className="result-title">验证结果</h4>
                
                <div className="result-section">
                  <div className="result-row">
                    <span className="result-label">匹配说话人</span>
                    <span className={`result-value ${result.speaker.verified ? 'success' : 'warning'}`}>
                      {result.speaker.best_match || '未找到匹配'}
                    </span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">相似度</span>
                    <span className="result-value">
                      {(result.speaker.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">验证状态</span>
                    <span className={`result-badge ${result.speaker.verified ? 'success' : 'failed'}`}>
                      {result.speaker.verified ? '验证通过' : '验证失败'}
                    </span>
                  </div>
                </div>

                <div className="result-section">
                  <h5 className="section-subtitle">伪造检测</h5>
                  <div className="result-row">
                    <span className="result-label">伪造概率</span>
                    <span 
                      className="result-value"
                      style={{ 
                        color: result.analysis.overall_result.fake_probability > 50 
                          ? '#dc2626' 
                          : '#16a34a' 
                      }}
                    >
                      {result.analysis.overall_result.fake_probability.toFixed(1)}%
                    </span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">风险等级</span>
                    <span className={`risk-badge ${result.analysis.overall_result.risk_level}`}>
                      {result.analysis.overall_result.risk_level === 'high' ? '高风险' : 
                       result.analysis.overall_result.risk_level === 'medium' ? '中风险' : '低风险'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="registered-list">
          <h4 className="list-title">已注册说话人 ({Object.keys(registeredSpeakers).length})</h4>
          {Object.keys(registeredSpeakers).length === 0 ? (
            <p className="empty-list">暂无注册说话人</p>
          ) : (
            <div className="speakers-grid">
              {Object.entries(registeredSpeakers).map(([id, count]) => (
                <div key={id} className="speaker-item">
                  <div className="speaker-info">
                    <span className="speaker-id">{id}</span>
                    <span className="speaker-count">{count} 条样本</span>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteSpeaker(id)}
                    title="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SpeakerVerification;
