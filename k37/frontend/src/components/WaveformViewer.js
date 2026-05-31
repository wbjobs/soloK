import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, ZoomIn, ZoomOut } from 'lucide-react';
import './WaveformViewer.css';

function WaveformViewer({ audioUrl, suspiciousSegments = [], heatmap = [] }) {
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(50);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    wavesurferRef.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#667eea',
      progressColor: '#764ba2',
      cursorColor: '#e74c3c',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 120,
      normalize: true,
    });

    wavesurferRef.current.load(audioUrl);

    wavesurferRef.current.on('finish', () => setIsPlaying(false));
    wavesurferRef.current.on('play', () => setIsPlaying(true));
    wavesurferRef.current.on('pause', () => setIsPlaying(false));

    return () => {
      wavesurferRef.current?.destroy();
    };
  }, [audioUrl]);

  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.zoom(zoom);
    }
  }, [zoom]);

  useEffect(() => {
    if (!wavesurferRef.current || suspiciousSegments.length === 0) return;

    const wrapper = waveformRef.current.querySelector('wave');
    if (!wrapper) return;

    const existingRegions = wrapper.querySelectorAll('.suspicious-region');
    existingRegions.forEach(region => region.remove());

    const duration = wavesurferRef.current.getDuration();
    if (duration === 0) return;

    suspiciousSegments.forEach((segment) => {
      const region = document.createElement('div');
      region.className = 'suspicious-region';
      region.style.position = 'absolute';
      region.style.top = '0';
      region.style.bottom = '0';
      region.style.left = `${(segment.start_time / duration) * 100}%`;
      region.style.width = `${((segment.end_time - segment.start_time) / duration) * 100}%`;
      region.style.background = 'rgba(231, 76, 60, 0.3)';
      region.style.borderLeft = '2px solid #e74c3c';
      region.style.borderRight = '2px solid #e74c3c';
      region.style.pointerEvents = 'none';
      region.style.zIndex = '10';
      wrapper.appendChild(region);
    });
  }, [suspiciousSegments, audioUrl]);

  const togglePlay = () => {
    wavesurferRef.current?.playPause();
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 20, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 20, 10));
  };

  return (
    <div className="waveform-container">
      <div className="waveform-header">
        <h3 className="section-title">波形可视化</h3>
        <div className="waveform-controls">
          <button className="control-btn" onClick={togglePlay}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="control-btn" onClick={handleZoomOut}>
            <ZoomOut size={18} />
          </button>
          <button className="control-btn" onClick={handleZoomIn}>
            <ZoomIn size={18} />
          </button>
        </div>
      </div>
      
      <div ref={waveformRef} className="waveform-wrapper"></div>
      
      {suspiciousSegments.length > 0 && (
        <div className="segments-legend">
          <div className="legend-item">
            <div className="legend-color suspicious"></div>
            <span>可疑伪造区域 ({suspiciousSegments.length} 处)</span>
          </div>
        </div>
      )}
      
      {suspiciousSegments.length > 0 && (
        <div className="segments-list">
          <h4>可疑时间段</h4>
          <div className="segments-grid">
            {suspiciousSegments.map((seg, idx) => (
              <div key={idx} className="segment-item">
                <span className="segment-index">#{idx + 1}</span>
                <span className="segment-time">
                  {seg.start_time.toFixed(2)}s - {seg.end_time.toFixed(2)}s
                </span>
                <span className="segment-duration">({seg.duration.toFixed(2)}s)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WaveformViewer;
