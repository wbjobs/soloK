import React, { useState, useRef } from 'react';
import { Upload, FileAudio, AlertCircle, Loader2 } from 'lucide-react';
import { uploadAudio, analyzeAudio } from '../services/api';
import './AudioUploader.css';

function AudioUploader({ onUploadComplete, isAnalyzing, onAnalyze, onResult, fileId }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const validateFile = (file) => {
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/x-flac'];
    const maxSize = 10 * 1024 * 1024;

    if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|flac)$/i)) {
      return '只支持 WAV/MP3/FLAC 格式的音频文件';
    }

    if (file.size > maxSize) {
      return '文件大小不能超过 10MB';
    }

    return null;
  };

  const handleFileSelect = async (file) => {
    setError('');
    const validationError = validateFile(file);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    
    try {
      const result = await uploadAudio(file);
      const audioUrl = URL.createObjectURL(file);
      onUploadComplete({ fileId: result.file_id, url: audioUrl });
    } catch (err) {
      setError('文件上传失败，请重试');
      console.error(err);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleAnalyze = async () => {
    if (!fileId) return;
    
    onAnalyze(true);
    try {
      const result = await analyzeAudio(fileId);
      onResult(result);
    } catch (err) {
      setError('分析失败，请重试');
      console.error(err);
    } finally {
      onAnalyze(false);
    }
  };

  return (
    <div className="upload-container">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".wav,.mp3,.flac"
          onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
          style={{ display: 'none' }}
        />
        
        <div className="drop-content">
          <div className="upload-icon-wrapper">
            <Upload size={32} className="upload-icon" />
          </div>
          <h3 className="drop-title">
            {selectedFile ? selectedFile.name : '拖拽音频文件到这里，或点击选择'}
          </h3>
          <p className="drop-subtitle">
            支持 WAV / MP3 / FLAC 格式，最长 60 秒，最大 10MB
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {fileId && !isAnalyzing && (
        <div className="action-buttons">
          <button
            className="analyze-btn"
            onClick={handleAnalyze}
          >
            <FileAudio size={18} />
            开始分析
          </button>
        </div>
      )}

      {isAnalyzing && (
        <div className="analyzing">
          <Loader2 size={24} className="spinning" />
          <span>正在分析音频...</span>
        </div>
      )}
    </div>
  );
}

export default AudioUploader;
