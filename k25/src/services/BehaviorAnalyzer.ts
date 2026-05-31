import { Keypoint, DetectionResult, PoseResult, DetectionType, GroupEvent, AgeEstimate } from '../types';
import {
  calculateVerticalAngle,
  calculateBodyHeight,
  calculateBodyWidth,
  calculateDistance,
  calculateBoundingBox,
  getKeypoint
} from '../utils/geometry';
import { KeypointValidator, ValidationResult } from '../utils/keypointValidator';
import { LightingInfo } from '../utils/lighting';
import { AgeEstimator } from '../utils/ageEstimator';
import { GroupBehaviorDetector } from './GroupBehaviorDetector';
import { FlowVector } from '../utils/opticalFlow';

interface PoseHistory {
  timestamp: number;
  keypoints: Keypoint[];
  headHeight: number;
  validation: ValidationResult;
  ageEstimate: AgeEstimate;
}

export interface AnalysisResult {
  detections: DetectionResult[];
  groupEvent: GroupEvent | null;
  ageEstimates: Map<string, AgeEstimate>;
}

export class BehaviorAnalyzer {
  private poseHistory: Map<string, PoseHistory[]> = new Map();
  private retrogradeStartTime: Map<string, number> = new Map();
  private lastAlertTime: Map<string, number> = new Map();
  private validator: KeypointValidator;
  private ageEstimator: typeof AgeEstimator;
  private groupDetector: GroupBehaviorDetector;
  private lightingInfo: LightingInfo | null = null;
  private detectionCooldown: number = 5000;
  private minStableFrames: number = 3;
  private enableAgeDetection: boolean = true;
  private enableGroupDetection: boolean = true;

  private settings = {
    fallThreshold: 60,
    fallHeightDropRatio: 0.5,
    elderlyFallThreshold: 45,
    elderlyFallHeightDropRatio: 0.35,
    retrogradeDuration: 1000,
    luggageDistanceRatio: 0.8,
    jumpVerticalSpeed: 0.5,
    jumpStepFrequency: 3,
    maxDensityPerSqm: 3
  };

  constructor() {
    this.validator = new KeypointValidator();
    this.ageEstimator = AgeEstimator;
    this.groupDetector = new GroupBehaviorDetector();
  }

  updateSettings(settings: Partial<typeof this.settings>) {
    this.settings = { ...this.settings, ...settings };
    
    if (settings.maxDensityPerSqm) {
      this.groupDetector.updateSettings({ maxDensityPerSqm: settings.maxDensityPerSqm });
    }
  }

  updateLightingInfo(info: LightingInfo) {
    this.lightingInfo = info;
    
    if (info.quality === 'bad') {
      this.validator.setThresholds(0.7, 0.7, 6);
    } else if (info.quality === 'poor') {
      this.validator.setThresholds(0.6, 0.65, 5);
    } else {
      this.validator.setThresholds(0.5, 0.6, 5);
    }
  }

  setAgeDetectionEnabled(enabled: boolean) {
    this.enableAgeDetection = enabled;
  }

  setGroupDetectionEnabled(enabled: boolean) {
    this.enableGroupDetection = enabled;
  }

  analyze(
    poses: PoseResult[],
    isRetrogradeFlow: boolean,
    retrogradeConfidence: number,
    flowVectors: FlowVector[] = [],
    frameWidth: number = 640,
    frameHeight: number = 480
  ): AnalysisResult {
    const detections: DetectionResult[] = [];
    const ageEstimates = new Map<string, AgeEstimate>();
    const now = Date.now();

    if (this.lightingInfo?.quality === 'bad') {
      return { detections: [], groupEvent: null, ageEstimates };
    }

    poses.forEach((pose, index) => {
      const personId = `person_${index}`;
      const { keypoints } = pose;

      const validation = this.validator.validate(keypoints);
      if (!validation.isValid) {
        return;
      }

      let ageEstimate: AgeEstimate = {
        ageGroup: 'adult',
        confidence: 0.5,
        shoulderHipRatio: 0,
        armLengthRatio: 0,
        legLengthRatio: 0,
        estimatedHeight: 0
      };

      if (this.enableAgeDetection) {
        ageEstimate = this.ageEstimator.estimate(keypoints);
        ageEstimates.set(personId, ageEstimate);
      }

      this.updateHistory(personId, keypoints, validation, ageEstimate);
      if (!this.isPoseStableEnough(personId)) {
        return;
      }

      const sensitivity = this.lightingInfo 
        ? this.getSensitivityMultiplier(this.lightingInfo)
        : 1.0;

      const fallResult = this.detectFall(personId, keypoints, sensitivity, ageEstimate);
      if (fallResult.detected && this.canAlert(personId)) {
        detections.push({
          type: 'fall',
          confidence: Math.min(1, fallResult.confidence * sensitivity),
          boundingBox: calculateBoundingBox(keypoints),
          timestamp: now,
          personId
        });
        this.lastAlertTime.set(personId, now);
        return;
      }

      if (isRetrogradeFlow && this.canAlert(personId)) {
        const retrogradeResult = this.detectRetrograde(personId, retrogradeConfidence, sensitivity);
        if (retrogradeResult.detected) {
          detections.push({
            type: 'retrograde',
            confidence: Math.min(1, retrogradeResult.confidence * sensitivity),
            boundingBox: calculateBoundingBox(keypoints),
            timestamp: now,
            personId
          });
          this.lastAlertTime.set(personId, now);
          return;
        }
      } else if (!isRetrogradeFlow) {
        this.retrogradeStartTime.delete(personId);
      }

      const luggageResult = this.detectLuggage(keypoints, sensitivity);
      if (luggageResult.detected && this.canAlert(personId)) {
        detections.push({
          type: 'luggage',
          confidence: Math.min(1, luggageResult.confidence * sensitivity),
          boundingBox: calculateBoundingBox(keypoints),
          timestamp: now,
          personId
        });
        this.lastAlertTime.set(personId, now);
        return;
      }

      const jumpResult = this.detectJump(personId, keypoints, sensitivity);
      if (jumpResult.detected && this.canAlert(personId)) {
        detections.push({
          type: 'jump',
          confidence: Math.min(1, jumpResult.confidence * sensitivity),
          boundingBox: calculateBoundingBox(keypoints),
          timestamp: now,
          personId
        });
        this.lastAlertTime.set(personId, now);
      }
    });

    let groupEvent: GroupEvent | null = null;

    if (this.enableGroupDetection && poses.length >= 2) {
      groupEvent = this.groupDetector.detect(poses, flowVectors, frameWidth, frameHeight);
      if (groupEvent) {
        groupEvent.timestamp = now;
      }
    }

    return { detections, groupEvent, ageEstimates };
  }

  private getSensitivityMultiplier(lighting: LightingInfo): number {
    switch (lighting.quality) {
      case 'excellent':
        return 1.0;
      case 'good':
        return 0.9;
      case 'poor':
        return 0.7;
      case 'bad':
        return 0.3;
      default:
        return 1.0;
    }
  }

  private canAlert(personId: string): boolean {
    const lastTime = this.lastAlertTime.get(personId);
    if (!lastTime) return true;
    return Date.now() - lastTime > this.detectionCooldown;
  }

  private updateHistory(
    personId: string,
    keypoints: Keypoint[],
    validation: ValidationResult,
    ageEstimate: AgeEstimate
  ): void {
    const nose = getKeypoint(keypoints, 'nose');
    const headHeight = nose?.y || 0;

    const history = this.poseHistory.get(personId) || [];
    history.push({
      timestamp: Date.now(),
      keypoints,
      headHeight,
      validation,
      ageEstimate
    });

    const maxHistorySize = 30;
    if (history.length > maxHistorySize) {
      history.splice(0, history.length - maxHistorySize);
    }

    this.poseHistory.set(personId, history);
  }

  private isPoseStableEnough(personId: string): boolean {
    const history = this.poseHistory.get(personId);
    if (!history || history.length < this.minStableFrames) {
      return false;
    }

    const recent = history.slice(-this.minStableFrames);
    let validFrames = 0;

    for (const entry of recent) {
      if (entry.validation.isValid) {
        validFrames++;
      }
    }

    return validFrames >= this.minStableFrames;
  }

  private detectFall(
    personId: string,
    keypoints: Keypoint[],
    sensitivity: number,
    ageEstimate: AgeEstimate
  ): { detected: boolean; confidence: number } {
    const leftShoulder = getKeypoint(keypoints, 'left_shoulder');
    const rightShoulder = getKeypoint(keypoints, 'right_shoulder');
    const leftHip = getKeypoint(keypoints, 'left_hip');
    const rightHip = getKeypoint(keypoints, 'right_hip');
    const nose = getKeypoint(keypoints, 'nose');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !nose) {
      return { detected: false, confidence: 0 };
    }

    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
      score: 1,
      name: 'shoulder_center'
    };

    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      score: 1,
      name: 'hip_center'
    };

    const torsoAngle = calculateVerticalAngle(shoulderCenter, hipCenter);
    const currentHeight = calculateBodyHeight(keypoints);

    const history = this.poseHistory.get(personId) || [];
    const validHistory = history.filter(h => h.validation.isValid);
    
    const maxHeadHeight = validHistory.length > 0
      ? Math.min(...validHistory.map(h => h.headHeight))
      : nose.y;

    const heightDropRatio = maxHeadHeight > 0
      ? (nose.y - maxHeadHeight) / currentHeight
      : 0;

    const fallThreshold = this.enableAgeDetection && ageEstimate.ageGroup === 'elderly'
      ? this.settings.elderlyFallThreshold
      : this.settings.fallThreshold;

    const heightDropThreshold = this.enableAgeDetection && ageEstimate.ageGroup === 'elderly'
      ? this.settings.elderlyFallHeightDropRatio
      : this.settings.fallHeightDropRatio;

    const adjustedThreshold = fallThreshold / sensitivity;
    const adjustedHeightRatio = heightDropThreshold / sensitivity;

    const angleConfidence = Math.min(1, torsoAngle / adjustedThreshold);
    const heightConfidence = Math.min(1, heightDropRatio / adjustedHeightRatio);

    const detected = torsoAngle > adjustedThreshold && 
                     heightDropRatio > adjustedHeightRatio;

    return {
      detected,
      confidence: detected ? (angleConfidence + heightConfidence) / 2 : 0
    };
  }

  private detectRetrograde(
    personId: string,
    flowConfidence: number,
    sensitivity: number
  ): { detected: boolean; confidence: number } {
    const now = Date.now();
    const startTime = this.retrogradeStartTime.get(personId);

    if (!startTime) {
      this.retrogradeStartTime.set(personId, now);
      return { detected: false, confidence: 0 };
    }

    const duration = now - startTime;
    const adjustedDuration = this.settings.retrogradeDuration / sensitivity;
    const durationConfidence = Math.min(1, duration / adjustedDuration);
    const detected = duration >= adjustedDuration;

    return {
      detected,
      confidence: detected ? (durationConfidence + flowConfidence) / 2 : 0
    };
  }

  private detectLuggage(
    keypoints: Keypoint[],
    sensitivity: number
  ): { detected: boolean; confidence: number } {
    const leftWrist = getKeypoint(keypoints, 'left_wrist');
    const rightWrist = getKeypoint(keypoints, 'right_wrist');
    const leftHip = getKeypoint(keypoints, 'left_hip');
    const rightHip = getKeypoint(keypoints, 'right_hip');

    if (!leftWrist || !rightWrist || !leftHip || !rightHip) {
      return { detected: false, confidence: 0 };
    }

    const bodyWidth = calculateBodyWidth(keypoints);
    if (bodyWidth === 0) return { detected: false, confidence: 0 };

    const leftDistance = calculateDistance(leftWrist, leftHip);
    const rightDistance = calculateDistance(rightWrist, rightHip);
    const maxDistance = Math.max(leftDistance, rightDistance);

    const distanceRatio = maxDistance / bodyWidth;
    const adjustedRatio = this.settings.luggageDistanceRatio / sensitivity;
    const detected = distanceRatio > adjustedRatio;

    return {
      detected,
      confidence: detected ? Math.min(1, distanceRatio / adjustedRatio) : 0
    };
  }

  private detectJump(
    personId: string,
    keypoints: Keypoint[],
    sensitivity: number
  ): { detected: boolean; confidence: number } {
    const history = this.poseHistory.get(personId) || [];
    const validHistory = history.filter(h => h.validation.isValid);
    
    if (validHistory.length < 10) {
      return { detected: false, confidence: 0 };
    }

    const nose = getKeypoint(keypoints, 'nose');
    const leftKnee = getKeypoint(keypoints, 'left_knee');
    const rightKnee = getKeypoint(keypoints, 'right_knee');

    if (!nose || !leftKnee || !rightKnee) {
      return { detected: false, confidence: 0 };
    }

    const recentHistory = validHistory.slice(-10);
    let verticalSpeed = 0;
    
    for (let i = 1; i < recentHistory.length; i++) {
      const dy = recentHistory[i].headHeight - recentHistory[i - 1].headHeight;
      const dt = (recentHistory[i].timestamp - recentHistory[i - 1].timestamp) / 1000;
      if (dt > 0) {
        verticalSpeed = Math.max(verticalSpeed, Math.abs(dy / dt));
      }
    }

    let stepCount = 0;
    let lastKneeY = (leftKnee.y + rightKnee.y) / 2;
    
    for (let i = recentHistory.length - 2; i >= 0; i--) {
      const h = recentHistory[i];
      const histLeftKnee = getKeypoint(h.keypoints, 'left_knee');
      const histRightKnee = getKeypoint(h.keypoints, 'right_knee');
      
      if (histLeftKnee && histRightKnee) {
        const currentKneeY = (histLeftKnee.y + histRightKnee.y) / 2;
        if (Math.abs(currentKneeY - lastKneeY) > 0.05) {
          stepCount++;
        }
        lastKneeY = currentKneeY;
      }
    }

    const timeSpan = (recentHistory[recentHistory.length - 1].timestamp - recentHistory[0].timestamp) / 1000;
    const stepFrequency = timeSpan > 0 ? stepCount / timeSpan : 0;

    const adjustedSpeed = this.settings.jumpVerticalSpeed / sensitivity;
    const adjustedFrequency = this.settings.jumpStepFrequency / sensitivity;

    const speedConfidence = Math.min(1, verticalSpeed / adjustedSpeed);
    const frequencyConfidence = Math.min(1, stepFrequency / adjustedFrequency);

    const detected = verticalSpeed > adjustedSpeed || 
                     stepFrequency > adjustedFrequency;

    return {
      detected,
      confidence: detected ? Math.max(speedConfidence, frequencyConfidence) : 0
    };
  }

  clearHistory() {
    this.poseHistory.clear();
    this.retrogradeStartTime.clear();
    this.lastAlertTime.clear();
    this.groupDetector.clearHistory();
  }
}

export const getDetectionTypeName = (type: DetectionType | 'overcrowding' | 'pushing' | 'panic'): string => {
  const names: Record<string, string> = {
    fall: '摔倒',
    retrograde: '逆行',
    luggage: '大件行李',
    jump: '跳跃/奔跑',
    overcrowding: '人群密度过高',
    pushing: '推挤行为',
    panic: '恐慌逃散'
  };
  return names[type] || type;
};

export const getDetectionTypeColor = (type: DetectionType | 'overcrowding' | 'pushing' | 'panic'): string => {
  const colors: Record<string, string> = {
    fall: '#EF4444',
    retrograde: '#F59E0B',
    luggage: '#3B82F6',
    jump: '#8B5CF6',
    overcrowding: '#F59E0B',
    pushing: '#DC2626',
    panic: '#991B1B'
  };
  return colors[type] || '#EF4444';
};
