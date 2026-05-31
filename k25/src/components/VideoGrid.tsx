import { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { useAppStore } from '../store/useAppStore';
import { DetectionResult, AlertEvent, GroupEvent } from '../types';
import { AlertAudioService } from '../services/AlertAudio';
import { IndexedDBService } from '../services/IndexedDBService';

const alertAudioService = new AlertAudioService();
const dbService = new IndexedDBService();

dbService.initialize();

export const VideoGrid = () => {
  const { 
    cameras, 
    updateDetections, 
    addAlert, 
    addGroupEvent,
    settings 
  } = useAppStore();
  const [fullscreenCamera, setFullscreenCamera] = useState<string | null>(null);
  const activeCameras = cameras.filter(c => c.enabled);

  const handleDetections = (cameraId: string, detections: DetectionResult[]) => {
    updateDetections(cameraId, detections);
  };

  const handleAlert = async (cameraId: string, detections: DetectionResult[]) => {
    if (detections.length === 0) return;

    const detection = detections[0];
    
    if (settings.enableAudioAlert) {
      alertAudioService.playAlert(detection.type);
      setTimeout(() => {
        const typeNames: Record<string, string> = {
          fall: '检测到摔倒',
          retrograde: '检测到逆行',
          luggage: '检测到大件行李',
          jump: '检测到危险动作'
        };
        alertAudioService.speak(typeNames[detection.type] || '检测到异常行为');
      }, 500);
    }

    const alertEvent: AlertEvent = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: detection.type,
      timestamp: Date.now(),
      confidence: detection.confidence,
      cameraId,
      thumbnail: ''
    };

    try {
      await dbService.initialize();
      await dbService.saveEvent(alertEvent);
      addAlert(alertEvent);
    } catch (error) {
      console.error('Failed to save alert:', error);
    }
  };

  const handleGroupEvent = async (cameraId: string, event: GroupEvent) => {
    if (settings.enableAudioAlert) {
      const eventTypeNames: Record<string, string> = {
        overcrowding: '检测到人群密度过高',
        pushing: '检测到推挤行为',
        panic: '检测到恐慌逃散'
      };
      alertAudioService.playAlert('panic');
      setTimeout(() => {
        alertAudioService.speak(eventTypeNames[event.type] || '检测到群体异常');
      }, 500);
    }

    const alertEvent: AlertEvent = {
      id: `group_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: event.type,
      timestamp: Date.now(),
      confidence: event.confidence,
      cameraId,
      isGroupEvent: true,
      personCount: event.personCount,
      description: event.description,
      thumbnail: ''
    };

    try {
      await dbService.initialize();
      await dbService.saveEvent(alertEvent);
      addAlert(alertEvent);
      addGroupEvent(event);
    } catch (error) {
      console.error('Failed to save group event:', error);
    }
  };

  const gridCols = fullscreenCamera ? 1 : Math.min(activeCameras.length, 2);
  const gridRows = fullscreenCamera ? 1 : activeCameras.length <= 2 ? 1 : 2;

  const displayCameras = fullscreenCamera 
    ? cameras.filter(c => c.id === fullscreenCamera)
    : activeCameras;

  return (
    <div 
      className="w-full h-full p-4"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        gap: '16px'
      }}
    >
      {displayCameras.map(camera => (
        <div 
          key={camera.id}
          className="relative rounded-lg overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition-colors cursor-pointer"
          onDoubleClick={() => setFullscreenCamera(
            fullscreenCamera === camera.id ? null : camera.id
          )}
        >
          <VideoPlayer
            camera={camera}
            onDetections={(detections) => handleDetections(camera.id, detections)}
            onAlert={(detections) => handleAlert(camera.id, detections)}
            onGroupEvent={(event) => handleGroupEvent(camera.id, event)}
          />
          
          {fullscreenCamera === camera.id && (
            <button
              className="absolute top-4 right-4 z-10 bg-black/60 hover:bg-black/80 text-white px-3 py-1 rounded"
              onClick={(e) => {
                e.stopPropagation();
                setFullscreenCamera(null);
              }}
            >
              退出全屏
            </button>
          )}
        </div>
      ))}

      {activeCameras.length === 0 && (
        <div className="col-span-full flex items-center justify-center">
          <div className="text-center text-gray-500">
            <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-lg">请在设置中启用摄像头</p>
          </div>
        </div>
      )}
    </div>
  );
};
