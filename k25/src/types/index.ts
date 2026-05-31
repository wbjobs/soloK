export interface Keypoint {
  x: number;
  y: number;
  z?: number;
  score: number;
  name: string;
}

export interface PoseResult {
  keypoints: Keypoint[];
  keypoints3D?: Keypoint[];
  score: number;
}

export type DetectionType = 'fall' | 'retrograde' | 'luggage' | 'jump';

export type GroupEventType = 'overcrowding' | 'pushing' | 'panic';

export interface DetectionResult {
  type: DetectionType;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  timestamp: number;
  personId: string;
}

export interface GroupEvent {
  type: GroupEventType;
  confidence: number;
  personCount: number;
  density: number;
  description: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  timestamp: number;
}

export type AgeGroup = 'child' | 'adult' | 'elderly';

export interface AgeEstimate {
  ageGroup: AgeGroup;
  confidence: number;
  shoulderHipRatio: number;
  armLengthRatio: number;
  legLengthRatio: number;
  estimatedHeight: number;
}

export interface AlertEvent {
  id: string;
  type: DetectionType | GroupEventType;
  timestamp: number;
  confidence: number;
  videoBlobId?: string;
  cameraId: string;
  thumbnail?: string;
  isGroupEvent?: boolean;
  personCount?: number;
  description?: string;
}

export interface CameraConfig {
  id: string;
  name: string;
  type: 'webcam' | 'webrtc';
  deviceId?: string;
  url?: string;
  enabled: boolean;
  escalatorDirection: 'up' | 'down' | 'left' | 'right';
}

export interface DetectionSettings {
  fallThreshold: number;
  fallHeightDropRatio: number;
  elderlyFallThreshold: number;
  elderlyFallHeightDropRatio: number;
  retrogradeDuration: number;
  luggageDistanceRatio: number;
  jumpVerticalSpeed: number;
  jumpStepFrequency: number;
  blurFace: boolean;
  enableAudioAlert: boolean;
  alertVolume: number;
  enableAgeDetection: boolean;
  enableGroupDetection: boolean;
  maxDensityPerSqm: number;
}

export interface StatisticsData {
  totalAlerts: number;
  byType: Record<DetectionType | GroupEventType, number>;
  byHour: Record<number, number>;
}
