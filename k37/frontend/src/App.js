import React, { useState } from 'react';
import './App.css';
import Header from './components/Header';
import AudioUploader from './components/AudioUploader';
import WaveformViewer from './components/WaveformViewer';
import DetectionResults from './components/DetectionResults';
import RealtimeDetector from './components/RealtimeDetector';
import SpeakerVerification from './components/SpeakerVerification';
import StreamingMonitor from './components/StreamingMonitor';
import { Shield, Mic, Upload, UserCheck, Radio } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [fileId, setFileId] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [detectionResult, setDetectionResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const tabs = [
    { id: 'upload', label: '文件检测', icon: Upload },
    { id: 'realtime', label: '实时检测', icon: Mic },
    { id: 'streaming', label: '直播监控', icon: Radio },
    { id: 'speaker', label: '说话人验证', icon: UserCheck },
  ];

  return (
    <div className="App">
      <Header />
      
      <div className="main-container">
        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="content">
          {activeTab === 'upload' && (
            <>
              <AudioUploader
                onUploadComplete={({ fileId, url }) => {
                  setFileId(fileId);
                  setAudioUrl(url);
                  setDetectionResult(null);
                }}
                isAnalyzing={isAnalyzing}
                onAnalyze={setIsAnalyzing}
                onResult={setDetectionResult}
                fileId={fileId}
              />
              
              {audioUrl && (
                <WaveformViewer
                  audioUrl={audioUrl}
                  suspiciousSegments={detectionResult?.localization?.suspicious_segments || []}
                  heatmap={detectionResult?.localization?.heatmap || []}
                />
              )}
              
              {detectionResult && (
                <DetectionResults
                  result={detectionResult}
                  fileId={fileId}
                />
              )}
            </>
          )}

          {activeTab === 'realtime' && (
            <RealtimeDetector />
          )}

          {activeTab === 'streaming' && (
            <StreamingMonitor />
          )}

          {activeTab === 'speaker' && (
            <SpeakerVerification />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
