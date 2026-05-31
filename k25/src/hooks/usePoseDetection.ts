import { useState, useEffect, useRef, useCallback } from 'react';
import { MediaPipePoseService } from '../services/MediaPipeService';
import { BehaviorAnalyzer, AnalysisResult } from '../services/BehaviorAnalyzer';
import { OpticalFlowCalculator, analyzeFlowDirection } from '../utils/opticalFlow';
import { LightingDetector, LightingInfo } from '../utils/lighting';
import { AgeEstimator } from '../utils/ageEstimator';
import { PoseResult, DetectionResult, GroupEvent, AgeEstimate } from '../types';

interface UsePoseDetectionOptions {
  enabled?: boolean;
  escalatorDirection?: 'up' | 'down' | 'left' | 'right';
  blurFace?: boolean;
  maxFps?: number;
  enableAgeDetection?: boolean;
  enableGroupDetection?: boolean;
}

export const usePoseDetection = (options: UsePoseDetectionOptions = {}) => {
  const { 
    enabled = true, 
    escalatorDirection = 'up', 
    blurFace = true,
    maxFps = 25,
    enableAgeDetection = true,
    enableGroupDetection = true
  } = options;
  
  const [poses, setPoses] = useState<PoseResult[]>([]);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [groupEvent, setGroupEvent] = useState<GroupEvent | null>(null);
  const [ageEstimates, setAgeEstimates] = useState<Map<string, AgeEstimate>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [latency, setLatency] = useState(0);
  const [lightingInfo, setLightingInfo] = useState<LightingInfo | null>(null);

  const poseServiceRef = useRef<MediaPipePoseService | null>(null);
  const analyzerRef = useRef<BehaviorAnalyzer | null>(null);
  const opticalFlowRef = useRef<OpticalFlowCalculator | null>(null);
  const lightingDetectorRef = useRef<LightingDetector | null>(null);
  const lastFrameProcessTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);

  useEffect(() => {
    if (enabled) {
      poseServiceRef.current = new MediaPipePoseService();
      analyzerRef.current = new BehaviorAnalyzer();
      opticalFlowRef.current = new OpticalFlowCalculator();
      lightingDetectorRef.current = new LightingDetector();
      
      analyzerRef.current.setAgeDetectionEnabled(enableAgeDetection);
      analyzerRef.current.setGroupDetectionEnabled(enableGroupDetection);
      
      poseServiceRef.current.initialize();
    }

    return () => {
      poseServiceRef.current?.destroy();
      analyzerRef.current?.clearHistory();
      opticalFlowRef.current?.reset();
      poseServiceRef.current = null;
      analyzerRef.current = null;
      opticalFlowRef.current = null;
      lightingDetectorRef.current = null;
    };
  }, [enabled, enableAgeDetection, enableGroupDetection]);

  const processFrame = useCallback(async (
    videoElement: HTMLVideoElement,
    outputCanvas: HTMLCanvasElement
  ) => {
    if (!enabled || !poseServiceRef.current || !analyzerRef.current || isProcessingRef.current) {
      return;
    }

    const now = performance.now();
    const minFrameInterval = 1000 / maxFps;
    
    if (now - lastFrameProcessTimeRef.current < minFrameInterval) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);

    const startTime = performance.now();

    try {
      const ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const width = outputCanvas.width;
      const height = outputCanvas.height;

      ctx.drawImage(videoElement, 0, 0, width, height);

      if (lightingDetectorRef.current && frameCountRef.current % 30 === 0) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const lighting = lightingDetectorRef.current.analyze(imageData);
        setLightingInfo(lighting);
        analyzerRef.current.updateLightingInfo(lighting);
      }

      const poseResults = await poseServiceRef.current.detect(videoElement);
      setPoses(poseResults);

      const imageData = ctx.getImageData(0, 0, width, height);
      const flowVectors = opticalFlowRef.current?.calculate(imageData) || [];
      const flowAnalysis = analyzeFlowDirection(flowVectors, escalatorDirection);

      const analysisResult: AnalysisResult = analyzerRef.current.analyze(
        poseResults,
        flowAnalysis.isRetrograde,
        flowAnalysis.confidence,
        flowVectors,
        width,
        height
      );

      setDetections(analysisResult.detections);
      setGroupEvent(analysisResult.groupEvent);
      setAgeEstimates(analysisResult.ageEstimates);

      if (blurFace && !lightingInfo?.isLowLight) {
        applyFaceBlur(ctx, poseResults, width, height);
      }

      drawSkeleton(ctx, poseResults, width, height, ageEstimates);
      drawDetections(ctx, analysisResult.detections, width, height);
      
      if (analysisResult.groupEvent) {
        drawGroupEvent(ctx, analysisResult.groupEvent, width, height);
      }
      
      if (ageEstimates.size > 0) {
        drawAgeLabels(ctx, analysisResult.ageEstimates, poseResults, width, height);
      }
      
      if (lightingInfo?.quality === 'poor' || lightingInfo?.quality === 'bad') {
        drawLightingWarning(ctx, lightingInfo);
      }

      frameCountRef.current++;
      lastFrameProcessTimeRef.current = now;

      const endTime = performance.now();
      setLatency(endTime - startTime);
    } catch (error) {
      console.error('Pose detection error:', error);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [enabled, escalatorDirection, blurFace, maxFps, lightingInfo, ageEstimates]);

  const applyFaceBlur = (
    ctx: CanvasRenderingContext2D,
    poses: PoseResult[],
    width: number,
    height: number
  ) => {
    poses.forEach(pose => {
      const nose = pose.keypoints.find(k => k.name === 'nose');
      const leftEar = pose.keypoints.find(k => k.name === 'left_ear');
      const rightEar = pose.keypoints.find(k => k.name === 'right_ear');

      if (nose && leftEar && rightEar && nose.score > 0.5) {
        const centerX = nose.x * width;
        const centerY = nose.y * height;
        const earDistance = Math.abs((rightEar.x - leftEar.x) * width);
        const blurRadius = Math.max(earDistance * 1.5, 30);

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, blurRadius, 0, Math.PI * 2);
        ctx.clip();
        
        ctx.filter = 'blur(20px)';
        ctx.drawImage(
          ctx.canvas,
          centerX - blurRadius,
          centerY - blurRadius,
          blurRadius * 2,
          blurRadius * 2,
          centerX - blurRadius,
          centerY - blurRadius,
          blurRadius * 2,
          blurRadius * 2
        );
        ctx.restore();
      }
    });
  };

  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    poses: PoseResult[],
    width: number,
    height: number,
    ageEstimates: Map<string, AgeEstimate>
  ) => {
    const connections = MediaPipePoseService.getConnections();

    poses.forEach((pose, index) => {
      const personId = `person_${index}`;
      const ageEstimate = ageEstimates.get(personId);
      
      let skeletonColor = 'rgba(16, 185, 129, 0.6)';
      if (ageEstimate) {
        skeletonColor = ageEstimate.ageGroup === 'elderly' 
          ? 'rgba(245, 158, 11, 0.6)'
          : ageEstimate.ageGroup === 'child'
            ? 'rgba(34, 197, 94, 0.6)'
            : 'rgba(59, 130, 246, 0.6)';
      }

      ctx.strokeStyle = skeletonColor;
      ctx.lineWidth = 2;

      connections.forEach(([from, to]) => {
        const fromKeypoint = pose.keypoints.find(k => k.name === from);
        const toKeypoint = pose.keypoints.find(k => k.name === to);

        if (fromKeypoint && toKeypoint && fromKeypoint.score > 0.5 && toKeypoint.score > 0.5) {
          ctx.beginPath();
          ctx.moveTo(fromKeypoint.x * width, fromKeypoint.y * height);
          ctx.lineTo(toKeypoint.x * width, toKeypoint.y * height);
          ctx.stroke();
        }
      });

      pose.keypoints.forEach(keypoint => {
        if (keypoint.score > 0.5) {
          ctx.fillStyle = keypoint.score > 0.8 ? '#10B981' : '#F59E0B';
          ctx.beginPath();
          ctx.arc(keypoint.x * width, keypoint.y * height, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
  };

  const drawDetections = (
    ctx: CanvasRenderingContext2D,
    detections: DetectionResult[],
    width: number,
    height: number
  ) => {
    const colorMap: Record<string, string> = {
      fall: '#EF4444',
      retrograde: '#F59E0B',
      luggage: '#3B82F6',
      jump: '#8B5CF6'
    };

    const labelMap: Record<string, string> = {
      fall: '摔倒',
      retrograde: '逆行',
      luggage: '大件行李',
      jump: '跳跃/奔跑'
    };

    detections.forEach(detection => {
      const color = colorMap[detection.type] || '#EF4444';
      const label = labelMap[detection.type] || detection.type;
      const x = detection.boundingBox.x * width;
      const y = detection.boundingBox.y * height;
      const w = detection.boundingBox.width * width;
      const h = detection.boundingBox.height * height;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      const text = `${label} ${(detection.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 14px sans-serif';
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(x, y - 24, textWidth + 16, 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, x + 8, y - 6);
    });
  };

  const drawGroupEvent = (
    ctx: CanvasRenderingContext2D,
    groupEvent: GroupEvent,
    width: number,
    height: number
  ) => {
    const colorMap: Record<string, string> = {
      overcrowding: '#F59E0B',
      pushing: '#DC2626',
      panic: '#991B1B'
    };

    const labelMap: Record<string, string> = {
      overcrowding: '人群密度过高',
      pushing: '推挤行为',
      panic: '恐慌逃散'
    };

    const color = colorMap[groupEvent.type] || '#F59E0B';
    const label = labelMap[groupEvent.type] || groupEvent.type;
    
    const x = groupEvent.boundingBox.x * width;
    const y = groupEvent.boundingBox.y * height;
    const w = groupEvent.boundingBox.width * width;
    const h = groupEvent.boundingBox.height * height;

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    const text = `⚠️ ${label} - ${groupEvent.description}`;
    ctx.font = 'bold 16px sans-serif';
    const textWidth = ctx.measureText(text).width;
    ctx.fillRect(x, y - 30, textWidth + 20, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x + 10, y - 8);

    const peopleCountText = `人数: ${groupEvent.personCount}`;
    ctx.font = '12px sans-serif';
    const countTextWidth = ctx.measureText(peopleCountText).width;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h + 5, countTextWidth + 10, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(peopleCountText, x + 5, y + h + 20);
  };

  const drawAgeLabels = (
    ctx: CanvasRenderingContext2D,
    ageEstimates: Map<string, AgeEstimate>,
    poses: PoseResult[],
    width: number,
    height: number
  ) => {
    poses.forEach((pose, index) => {
      const personId = `person_${index}`;
      const ageEstimate = ageEstimates.get(personId);
      
      if (!ageEstimate || ageEstimate.confidence < 0.4) return;

      const nose = pose.keypoints.find(k => k.name === 'nose');
      if (!nose || nose.score < 0.5) return;

      const x = nose.x * width;
      const y = nose.y * height - 40;

      const ageGroupName = AgeEstimator.getAgeGroupName(ageEstimate.ageGroup);
      const ageColor = AgeEstimator.getAgeGroupColor(ageEstimate.ageGroup);

      ctx.fillStyle = ageColor;
      const text = `${ageGroupName} ${(ageEstimate.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 12px sans-serif';
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(x - textWidth / 2 - 5, y - 15, textWidth + 10, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, x - textWidth / 2, y);
    });
  };

  const drawLightingWarning = (
    ctx: CanvasRenderingContext2D,
    lighting: LightingInfo
  ) => {
    ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
    ctx.fillRect(10, 10, 280, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`⚠️ ${lighting.recommendation}`, 20, 30);
  };

  return {
    poses,
    detections,
    groupEvent,
    ageEstimates,
    isProcessing,
    latency,
    lightingInfo,
    processFrame
  };
};
