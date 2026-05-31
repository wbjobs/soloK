import { Keypoint, PoseResult } from '../types';

const POSE_CONNECTIONS = [
  ['nose', 'left_eye_inner'],
  ['left_eye_inner', 'left_eye'],
  ['left_eye', 'left_eye_outer'],
  ['left_eye_outer', 'left_ear'],
  ['nose', 'right_eye_inner'],
  ['right_eye_inner', 'right_eye'],
  ['right_eye', 'right_eye_outer'],
  ['right_eye_outer', 'right_ear'],
  ['mouth_left', 'mouth_right'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['left_wrist', 'left_thumb'],
  ['left_wrist', 'left_pinky'],
  ['left_wrist', 'left_index'],
  ['left_index', 'left_pinky'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['right_wrist', 'right_thumb'],
  ['right_wrist', 'right_pinky'],
  ['right_wrist', 'right_index'],
  ['right_index', 'right_pinky'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['left_ankle', 'left_heel'],
  ['left_heel', 'left_foot_index'],
  ['left_ankle', 'left_foot_index'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
  ['right_ankle', 'right_heel'],
  ['right_heel', 'right_foot_index'],
  ['right_ankle', 'right_foot_index'],
];

const KEYPOINT_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner',
  'right_eye', 'right_eye_outer', 'left_ear', 'right_ear', 'mouth_left',
  'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index',
  'right_index', 'left_thumb', 'right_thumb', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel',
  'right_heel', 'left_foot_index', 'right_foot_index'
];

export class MediaPipePoseService {
  private pose: any = null;
  private initialized: boolean = false;
  private scriptLoaded: boolean = false;

  async loadScript(): Promise<void> {
    if (this.scriptLoaded) return;

    return new Promise((resolve, reject) => {
      const checkPoseLoaded = () => {
        if ((window as any).Pose) {
          this.scriptLoaded = true;
          resolve();
          return true;
        }
        return false;
      };

      if (checkPoseLoaded()) return;

      const existingScript = document.querySelector('script[src*="pose.js"]');
      if (existingScript) {
        const checkInterval = setInterval(() => {
          if (checkPoseLoaded()) {
            clearInterval(checkInterval);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (!this.scriptLoaded) {
            reject(new Error('MediaPipe Pose script load timeout'));
          }
        }, 10000);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        const checkInterval = setInterval(() => {
          if (checkPoseLoaded()) {
            clearInterval(checkInterval);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (!this.scriptLoaded) {
            reject(new Error('MediaPipe Pose initialization timeout'));
          }
        }, 5000);
      };
      script.onerror = () => reject(new Error('Failed to load MediaPipe Pose script'));
      document.head.appendChild(script);
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadScript();

    const Pose = (window as any).Pose;
    if (!Pose) {
      throw new Error('MediaPipe Pose not loaded');
    }

    this.pose = new Pose({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
      }
    });

    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.initialized = true;
  }

  async detect(imageData: HTMLVideoElement | HTMLImageElement): Promise<PoseResult[]> {
    if (!this.pose || !this.initialized) {
      await this.initialize();
    }

    return new Promise((resolve) => {
      if (!this.pose) {
        resolve([]);
        return;
      }

      this.pose.onResults((results: any) => {
        const poses: PoseResult[] = [];
        
        if (results.poseLandmarks) {
          const keypoints: Keypoint[] = results.poseLandmarks.map((landmark: any, index: number) => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
            score: landmark.visibility || 0,
            name: KEYPOINT_NAMES[index] || `keypoint_${index}`
          }));

          poses.push({
            keypoints,
            keypoints3D: results.poseWorldLandmarks?.map((landmark: any, index: number) => ({
              x: landmark.x,
              y: landmark.y,
              z: landmark.z,
              score: landmark.visibility || 0,
              name: KEYPOINT_NAMES[index] || `keypoint_${index}`
            })),
            score: 1
          });
        }

        resolve(poses);
      });

      this.pose.send({ image: imageData });
    });
  }

  static getConnections(): string[][] {
    return POSE_CONNECTIONS;
  }

  static getKeypointIndex(name: string): number {
    return KEYPOINT_NAMES.indexOf(name);
  }

  destroy(): void {
    this.pose?.close();
    this.pose = null;
    this.initialized = false;
  }
}
