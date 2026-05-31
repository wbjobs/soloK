import { useState, useCallback, useEffect } from 'react';
import { Video, Square, Download, Trash2, Settings } from 'lucide-react';
import useSimulationStore from '../store/useSimulationStore';
import {
  startRecording as apiStartRecording,
  stopRecording as apiStopRecording,
  clearRecording as apiClearRecording,
  exportGLTF as apiExportGLTF,
  getRecordingStatus as apiGetRecordingStatus,
} from '../hooks/useSimulation';

export default function RecordingPanel() {
  const recordingStatus = useSimulationStore((s) => s.recordingStatus);
  const setRecordingStatus = useSimulationStore((s) => s.setRecordingStatus);
  const [recordEvery, setRecordEvery] = useState(10);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const status = await apiGetRecordingStatus();
        setRecordingStatus(status);
      } catch (e) {
        console.error('Failed to get recording status:', e);
      }
    };
    const interval = setInterval(poll, 1000);
    poll();
    return () => clearInterval(interval);
  }, [setRecordingStatus]);

  const handleStart = useCallback(async () => {
    try {
      const status = await apiStartRecording(recordEvery);
      setRecordingStatus(status);
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [recordEvery, setRecordingStatus]);

  const handleStop = useCallback(async () => {
    try {
      const status = await apiStopRecording();
      setRecordingStatus(status);
    } catch (e) {
      console.error('Failed to stop recording:', e);
    }
  }, [setRecordingStatus]);

  const handleClear = useCallback(async () => {
    try {
      const status = await apiClearRecording();
      setRecordingStatus(status);
    } catch (e) {
      console.error('Failed to clear recording:', e);
    }
  }, [setRecordingStatus]);

  const handleExport = useCallback(() => {
    apiExportGLTF();
  }, []);

  return (
    <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <div className="glass-panel rounded-xl px-6 py-4">
        <div className="flex items-center gap-4">
          {recordingStatus.is_recording && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-red-400 font-mono">
                REC {recordingStatus.frame_count} 帧
              </span>
            </div>
          )}

          {!recordingStatus.is_recording ? (
            <>
              <button
                onClick={handleStart}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-500/80
                  text-white rounded-lg font-medium text-sm transition-all
                  active:scale-95 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              >
                <Video className="w-4 h-4" />
                开始录制
              </button>

              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2.5 bg-space-blue/70 hover:bg-space-blue text-gray-300
                  rounded-lg transition-all active:scale-95"
                title="录制设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-600 hover:bg-gray-500
                text-white rounded-lg font-medium text-sm transition-all
                active:scale-95"
            >
              <Square className="w-4 h-4" />
              停止录制
            </button>
          )}

          {!recordingStatus.is_recording && recordingStatus.frame_count > 0 && (
            <>
              <div className="h-8 w-px bg-gray-600/50" />

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{recordingStatus.frame_count} 帧</span>
              </div>

              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-cyber-cyan/20
                  hover:bg-cyber-cyan/30 text-cyber-cyan rounded-lg font-medium
                  text-sm transition-all active:scale-95 border border-cyber-cyan/30"
              >
                <Download className="w-4 h-4" />
                导出 GLTF
              </button>

              <button
                onClick={handleClear}
                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400
                  rounded-lg transition-all active:scale-95 border border-red-500/30"
                title="清除录制"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {showSettings && (
          <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-400">每 N 步录制一帧</span>
              <input
                type="number"
                min="1"
                max="100"
                value={recordEvery}
                onChange={(e) => setRecordEvery(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                className="w-20 px-3 py-1.5 bg-space-blue/70 border border-gray-600/50
                  rounded text-cyber-cyan text-sm data-value focus:outline-none
                  focus:border-cyber-cyan/50"
              />
            </div>
            <p className="text-xs text-gray-500">
              数值越小，轨迹越精细，但文件越大。建议 10-20。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
