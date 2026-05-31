import { useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getDetectionTypeName, getDetectionTypeColor } from '../services/BehaviorAnalyzer';
import { IndexedDBService } from '../services/IndexedDBService';

const dbService = new IndexedDBService();

export const AlertList = () => {
  const { alerts, clearAlerts } = useAppStore();
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayVideo = async (alertId: string) => {
    try {
      await dbService.initialize();
      const blob = await dbService.getVideoBlob(alertId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setSelectedAlert(alertId);
      }
    } catch (error) {
      console.error('Failed to load video:', error);
    }
  };

  const closeVideo = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(null);
    setSelectedAlert(null);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">报警记录</h2>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors"
          >
            清空记录
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`bg-secondary rounded-lg p-4 cursor-pointer transition-all hover:bg-gray-700 ${
                  selectedAlert === alert.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handlePlayVideo(alert.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getDetectionTypeColor(alert.type) }}
                    />
                    <span className="text-white font-medium">
                      {getDetectionTypeName(alert.type)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">
                    {formatTime(alert.timestamp)}
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">
                    置信度: <span className="text-white">{(alert.confidence * 100).toFixed(0)}%</span>
                  </span>
                  <span className="text-gray-400">
                    摄像头: <span className="text-white">{alert.cameraId}</span>
                  </span>
                </div>

                {alert.thumbnail && (
                  <div className="mt-3">
                    <img
                      src={alert.thumbnail}
                      alt="Alert thumbnail"
                      className="w-full h-32 object-cover rounded"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p>暂无报警记录</p>
            <p className="text-sm mt-1">系统运行正常</p>
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-secondary rounded-xl p-4 max-w-4xl w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">报警视频回放</h3>
              <button
                onClick={closeVideo}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
