import { useState, useEffect } from 'react';
import './MacroPanel.css';

function MacroPanel({ sessionId, isRecording, recordingStatus, onStartRecording, onStopRecording, onCancelRecording, onPlayMacro }) {
  const [macros, setMacros] = useState([]);
  const [macroName, setMacroName] = useState('');
  const [macroDescription, setMacroDescription] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loopCount, setLoopCount] = useState(1);
  const [activePlayback, setActivePlayback] = useState(null);

  const fetchMacros = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/macros');
      const data = await response.json();
      setMacros(data.macros || []);
    } catch (error) {
      console.error('Failed to fetch macros:', error);
    }
  };

  useEffect(() => {
    fetchMacros();
  }, []);

  const handleStartRecording = () => {
    onStartRecording();
  };

  const handleStopRecording = () => {
    setShowSaveDialog(true);
  };

  const handleSaveMacro = async () => {
    const result = await onStopRecording(macroName, macroDescription, []);
    if (result) {
      fetchMacros();
    }
    setShowSaveDialog(false);
    setMacroName('');
    setMacroDescription('');
  };

  const handleCancelRecording = () => {
    onCancelRecording();
    setShowSaveDialog(false);
    setMacroName('');
    setMacroDescription('');
  };

  const handlePlayMacro = async (macroId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/macros/${macroId}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          options: {
            speed: playbackSpeed,
            loopCount
          }
        })
      });
      const data = await response.json();
      setActivePlayback(data.playbackId);
      
      const macro = macros.find(m => m.macroId === macroId);
      if (macro) {
        setTimeout(() => {
          setActivePlayback(null);
        }, (macro.duration / playbackSpeed) * loopCount + 1000);
      }
    } catch (error) {
      console.error('Failed to play macro:', error);
    }
  };

  const handleDeleteMacro = async (macroId) => {
    if (!confirm('Delete this macro?')) return;
    try {
      await fetch(`http://localhost:3001/api/macros/${macroId}`, {
        method: 'DELETE'
      });
      fetchMacros();
    } catch (error) {
      console.error('Failed to delete macro:', error);
    }
  };

  const formatDuration = (ms) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div className="macro-panel">
      <h3>Macro Recorder</h3>

      <div className="record-controls">
        {!isRecording ? (
          <button 
            className="record-btn start"
            onClick={handleStartRecording}
          >
            <span className="record-dot"></span>
            Start Recording
          </button>
        ) : (
          <div className="recording-indicator">
            <span className="recording-pulse"></span>
            <span>Recording... {recordingStatus?.eventCount || 0} events</span>
            <span className="recording-time">
              {formatDuration(recordingStatus?.duration || 0)}
            </span>
            <button 
              className="record-btn stop"
              onClick={handleStopRecording}
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {showSaveDialog && (
        <div className="save-dialog">
          <h4>Save Macro</h4>
          <input
            type="text"
            placeholder="Macro name"
            value={macroName}
            onChange={(e) => setMacroName(e.target.value)}
          />
          <textarea
            placeholder="Description (optional)"
            value={macroDescription}
            onChange={(e) => setMacroDescription(e.target.value)}
          />
          <div className="dialog-actions">
            <button onClick={handleCancelRecording} className="cancel">
              Cancel
            </button>
            <button onClick={handleSaveMacro} className="save">
              Save
            </button>
          </div>
        </div>
      )}

      <div className="playback-settings">
        <div className="setting-group">
          <label>Speed:</label>
          <select 
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
        <div className="setting-group">
          <label>Loops:</label>
          <input
            type="number"
            min="1"
            max="10"
            value={loopCount}
            onChange={(e) => setLoopCount(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="macro-list">
        <h4>Saved Macros ({macros.length})</h4>
        {macros.length === 0 ? (
          <div className="no-macros">
            <p>No macros saved yet</p>
            <p className="hint">Start recording to create a macro</p>
          </div>
        ) : (
          macros.map(macro => (
            <div 
              key={macro.macroId} 
              className={`macro-card ${activePlayback ? 'playing' : ''}`}
            >
              <div className="macro-info">
                <span className="macro-name">{macro.name}</span>
                <span className="macro-stats">
                  {macro.eventCount} events • {formatDuration(macro.duration)}
                </span>
              </div>
              {macro.description && (
                <p className="macro-description">{macro.description}</p>
              )}
              <div className="macro-actions">
                <button 
                  className="play-btn"
                  onClick={() => handlePlayMacro(macro.macroId)}
                  disabled={!!activePlayback}
                >
                  ▶ Play
                </button>
                <button 
                  className="delete-btn"
                  onClick={() => handleDeleteMacro(macro.macroId)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MacroPanel;
