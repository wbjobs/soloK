import { useState, useRef, useCallback, useEffect } from 'react';
import { PlayerMark } from '../types';
import { TrackedPoint, computeFarnebackFlow } from '../utils/opticalFlow';

export interface UseOpticalTrackingOptions {
  enabled: boolean;
  canvasWidth: number;
  canvasHeight: number;
  searchWindow?: number;
  minConfidence?: number;
  maxTrackingFrames?: number;
}

export function useOpticalTracking(options: UseOpticalTrackingOptions) {
  const {
    canvasWidth,
    canvasHeight,
    searchWindow = 30,
    minConfidence = 0.3,
    maxTrackingFrames = 300,
  } = options;

  const [isTracking, setIsTracking] = useState(false);
  const [trackedPoints, setTrackedPoints] = useState<TrackedPoint[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  
  const prevFrameData = useRef<ImageData | null>(null);
  const trackingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackingFrameCount = useRef(0);

  if (!trackingCanvasRef.current && typeof document !== 'undefined') {
    trackingCanvasRef.current = document.createElement('canvas');
    trackingCanvasRef.current.width = canvasWidth;
    trackingCanvasRef.current.height = canvasHeight;
  }

  const captureFrame = useCallback((source: HTMLVideoElement | HTMLImageElement | null): ImageData | null => {
    if (!source || !trackingCanvasRef.current) return null;
    
    const canvas = trackingCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    try {
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) {
      console.warn('Failed to capture frame:', e);
      return null;
    }
  }, []);

  const initializeTracking = useCallback((playerMarks: PlayerMark[], sourceFrame: ImageData) => {
    const points: TrackedPoint[] = playerMarks.map(mark => ({
      id: mark.id,
      position: { ...mark.position },
      previousPosition: { ...mark.position },
      velocity: { x: 0, y: 0 },
      confidence: 1.0,
      type: mark.type,
      searchWindow,
    }));
    
    setTrackedPoints(points);
    prevFrameData.current = sourceFrame;
    trackingFrameCount.current = 0;
    setIsTracking(true);
    setFrameCount(0);
  }, [searchWindow]);

  const updateTracking = useCallback((newFrame: ImageData): TrackedPoint[] => {
    if (!prevFrameData.current || trackedPoints.length === 0) {
      prevFrameData.current = newFrame;
      return trackedPoints;
    }

    const newTrackedPoints = computeFarnebackFlow(
      prevFrameData.current,
      newFrame,
      trackedPoints
    );

    const filteredPoints = newTrackedPoints.map(point => {
      if (point.confidence < minConfidence) {
        return {
          ...point,
          position: point.previousPosition,
          velocity: { x: 0, y: 0 },
        };
      }
      return point;
    });

    setTrackedPoints(filteredPoints);
    prevFrameData.current = newFrame;
    trackingFrameCount.current++;
    setFrameCount(trackingFrameCount.current);

    if (trackingFrameCount.current >= maxTrackingFrames) {
      setIsTracking(false);
    }

    return filteredPoints;
  }, [trackedPoints, minConfidence, maxTrackingFrames]);

  const addTrackedPoint = useCallback((mark: PlayerMark) => {
    const newPoint: TrackedPoint = {
      id: mark.id,
      position: { ...mark.position },
      previousPosition: { ...mark.position },
      velocity: { x: 0, y: 0 },
      confidence: 1.0,
      type: mark.type,
      searchWindow,
    };
    
    setTrackedPoints(prev => [...prev, newPoint]);
  }, [searchWindow]);

  const removeTrackedPoint = useCallback((id: string) => {
    setTrackedPoints(prev => prev.filter(p => p.id !== id));
  }, []);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    prevFrameData.current = null;
    trackingFrameCount.current = 0;
  }, []);

  const resetTracking = useCallback(() => {
    setTrackedPoints([]);
    setIsTracking(false);
    prevFrameData.current = null;
    trackingFrameCount.current = 0;
    setFrameCount(0);
  }, []);

  const getTrackedPlayerMarks = useCallback((): PlayerMark[] => {
    return trackedPoints.map(point => ({
      id: point.id,
      position: point.position,
      realWorldPosition: null,
      type: point.type,
      sourceCameraAngle: 0,
    }));
  }, [trackedPoints]);

  const getAverageConfidence = useCallback((): number => {
    if (trackedPoints.length === 0) return 0;
    return trackedPoints.reduce((sum, p) => sum + p.confidence, 0) / trackedPoints.length;
  }, [trackedPoints]);

  return {
    isTracking,
    trackedPoints,
    frameCount,
    captureFrame,
    initializeTracking,
    updateTracking,
    addTrackedPoint,
    removeTrackedPoint,
    stopTracking,
    resetTracking,
    getTrackedPlayerMarks,
    getAverageConfidence,
  };
}

export function useFrameProcessor(
  videoRef: React.RefObject<HTMLVideoElement>,
  onFrame: (frame: ImageData) => void,
  enabled: boolean
) {
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    if (!canvasRef.current && typeof document !== 'undefined') {
      canvasRef.current = document.createElement('canvas');
    }

    const processFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas || video.paused || video.ended) {
        animationRef.current = requestAnimationFrame(processFrame);
        return;
      }

      canvas.width = video.videoWidth || 960;
      canvas.height = video.videoHeight || 540;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationRef.current = requestAnimationFrame(processFrame);
        return;
      }

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        onFrame(frameData);
      } catch (e) {
        console.warn('Frame processing error:', e);
      }

      animationRef.current = requestAnimationFrame(processFrame);
    };

    animationRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [videoRef, onFrame, enabled]);
}
