import { useEffect, useRef, useState, useCallback } from 'react';
import { useCamera } from '../hooks/useCamera';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { CameraConfig, DetectionResult, GroupEvent } from '../types';

interface VideoPlayerProps {
  camera: CameraConfig;
  onDetections?: (detections: DetectionResult[]) => void;
  onAlert?: (detections: DetectionResult[]) => void;
  onGroupEvent?: (event: GroupEvent) => void;
}

export const VideoPlayer = ({ camera, onDetections, onAlert, onGroupEvent }: VideoPlayerProps) => {
  const { videoRef, startCamera, stopCamera, isActive } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const [cameraError, setCameraError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastGroupEventTimeRef = useRef(0);

  const { 
    detections, 
    groupEvent, 
    ageEstimates, 
    processFrame, 
    latency, 
    lightingInfo 
  } = usePoseDetection({
    enabled: camera.enabled,
    escalatorDirection: camera.escalatorDirection,
    blurFace: true,
    maxFps: 25,
    enableAgeDetection: true,
    enableGroupDetection: true
  });

  const cleanupResources = useCallback(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (camera.enabled) {
      startCamera(camera.deviceId).catch((err) => {
        setCameraError(err.message || '无法访问摄像头');
      });
    } else {
      stopCamera();
      setCameraError(null);
      cleanupResources();
    }

    return () => {
      stopCamera();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      cleanupResources();
    };
  }, [camera.enabled, camera.deviceId, startCamera, stopCamera, cleanupResources]);

  useEffect(() => {
    cleanupIntervalRef.current = setInterval(() => {
      cleanupResources();
    }, 30000);

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [cleanupResources]);

  useEffect(() => {
    if (groupEvent) {
      const now = Date.now();
      if (now - lastGroupEventTimeRef.current > 10000) {
        onGroupEvent?.(groupEvent);
        lastGroupEventTimeRef.current = now;
      }
    }
  }, [groupEvent, onGroupEvent]);

  useEffect(() => {
    if (!isActive || !videoRef.current || !canvasRef.current) return;

    let lastDetectionsLength = 0;

    const processLoop = async () => {
      if (!isMountedRef.current) return;
      
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        
        if (video.readyState < 2) {
          animationRef.current = requestAnimationFrame(processLoop);
          return;
        }

        canvasRef.current.width = video.videoWidth || 640;
        canvasRef.current.height = video.videoHeight || 480;

        try {
          await processFrame(video, canvasRef.current);
        } catch (err) {
          console.error('Process frame error:', err);
        }

        frameCountRef.current++;
        const now = Date.now();
        if (now - lastFpsUpdateRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsUpdateRef.current = now;
        }

        if (detections.length !== lastDetectionsLength) {
          onDetections?.(detections);
          lastDetectionsLength = detections.length;
        }

        if (detections.length > 0) {
          onAlert?.(detections);
        }
      }
      
      if (isMountedRef.current) {
        animationRef.current = requestAnimationFrame(processLoop);
      }
    };

    animationRef.current = requestAnimationFrame(processLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, processFrame, onDetections, onAlert, detections.length]);

  const elderlyCount = Array.from(ageEstimates.values()).filter(a => a.ageGroup === 'elderly').length;
  const childCount = Array.from(ageEstimates.values()).filter(a => a.ageGroup === 'child').length;

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-0"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
      />
      
      {!isActive && camera.enabled && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">正在启动摄像头...</p>
          </div>
        </div>
      )}

      {cameraError && camera.enabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-red-400 font-medium">摄像头不可用</p>
            <p className="text-gray-500 text-sm mt-2">{cameraError}</p>
          </div>
        </div>
      )}

      {!camera.enabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400">摄像头未启用</p>
          </div>
        </div>
      )}

      <div className="absolute top-2 left-2 bg-black/60 px-3 py-1 rounded text-sm">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-500'}`}></span>
          <span className="text-white font-medium">{camera.name}</span>
        </div>
      </div>

      <div className="absolute bottom-2 left-2 bg-black/60 px-3 py-1 rounded text-xs text-white space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">FPS:</span>
          <span className="font-mono text-green-400">{fps}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">延迟:</span>
          <span className="font-mono text-yellow-400">{latency.toFixed(0)}ms</span>
        </div>
      </div>

      <div className="absolute bottom-2 right-2 bg-black/60 px-3 py-1 rounded text-xs">
        <span className="text-gray-400">方向: </span>
        <span className="text-white">
          {camera.escalatorDirection === 'up' ? '↑ 上行' : 
           camera.escalatorDirection === 'down' ? '↓ 下行' :
           camera.escalatorDirection === 'left' ? '← 左行' : '→ 右行'}
        </span>
      </div>

      {(elderlyCount > 0 || childCount > 0) && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-black/60 px-3 py-1 rounded text-xs text-white flex gap-3">
          {elderlyCount > 0 && (
            <span className="text-yellow-400">👴 老人: {elderlyCount}</span>
          )}
          {childCount > 0 && (
            <span className="text-green-400">👶 儿童: {childCount}</span>
          )}
        </div>
      )}

      {lightingInfo && (lightingInfo.quality === 'poor' || lightingInfo.quality === 'bad') && (
        <div className="absolute top-2 right-2 bg-yellow-500/80 px-3 py-1 rounded text-xs text-white">
          {lightingInfo.quality === 'bad' ? '光照严重不足' : '光照不足'}
        </div>
      )}

      {groupEvent && (
        <div className="absolute top-12 right-2 bg-red-600/80 px-3 py-1 rounded text-xs text-white animate-pulse">
          ⚠️ {groupEvent.type === 'overcrowding' ? '人群密度过高' : 
              groupEvent.type === 'pushing' ? '推挤行为' : '恐慌逃散'}
        </div>
      )}

      {detections.length > 0 && (
        <div className="absolute top-2 right-2 bg-red-500/80 px-3 py-1 rounded animate-pulse">
          <span className="text-white text-sm font-bold">警报</span>
        </div>
      )}
    </div>
  );
};
