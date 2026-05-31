import { Keypoint } from '../types';

export interface ValidationResult {
  isValid: boolean;
  validKeypoints: number;
  totalKeypoints: number;
  averageScore: number;
  issues: string[];
}

const CRITICAL_KEYPOINTS = [
  'nose',
  'left_shoulder',
  'right_shoulder',
  'left_hip',
  'right_hip',
  'left_ankle',
  'right_ankle'
];

const UPPER_BODY_KEYPOINTS = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist'
];

const LOWER_BODY_KEYPOINTS = [
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle'
];

export class KeypointValidator {
  private minConfidence: number = 0.5;
  private minValidRatio: number = 0.6;
  private minCriticalPoints: number = 5;

  setThresholds(minConfidence: number, minValidRatio: number, minCriticalPoints: number) {
    this.minConfidence = minConfidence;
    this.minValidRatio = minValidRatio;
    this.minCriticalPoints = minCriticalPoints;
  }

  validate(keypoints: Keypoint[]): ValidationResult {
    const issues: string[] = [];
    
    if (!keypoints || keypoints.length === 0) {
      return {
        isValid: false,
        validKeypoints: 0,
        totalKeypoints: 0,
        averageScore: 0,
        issues: ['无关键点数据']
      };
    }

    const validKeypoints = keypoints.filter(kp => kp.score >= this.minConfidence);
    const validRatio = validKeypoints.length / keypoints.length;
    
    const totalScore = keypoints.reduce((sum, kp) => sum + kp.score, 0);
    const averageScore = totalScore / keypoints.length;

    const validCritical = CRITICAL_KEYPOINTS.filter(name => {
      const kp = keypoints.find(k => k.name === name);
      return kp && kp.score >= this.minConfidence;
    });

    if (validKeypoints.length < this.minCriticalPoints) {
      issues.push('有效关键点数量不足');
    }

    if (validRatio < this.minValidRatio) {
      issues.push(`关键点有效率过低: ${(validRatio * 100).toFixed(0)}%`);
    }

    if (validCritical.length < this.minCriticalPoints) {
      issues.push('关键身体部位检测缺失');
    }

    const upperBodyValid = UPPER_BODY_KEYPOINTS.filter(name => {
      const kp = keypoints.find(k => k.name === name);
      return kp && kp.score >= this.minConfidence;
    }).length;

    const lowerBodyValid = LOWER_BODY_KEYPOINTS.filter(name => {
      const kp = keypoints.find(k => k.name === name);
      return kp && kp.score >= this.minConfidence;
    }).length;

    if (upperBodyValid < 3) {
      issues.push('上半身关键点缺失');
    }

    if (lowerBodyValid < 2) {
      issues.push('下半身关键点缺失');
    }

    const nose = keypoints.find(k => k.name === 'nose');
    const leftAnkle = keypoints.find(k => k.name === 'left_ankle');
    const rightAnkle = keypoints.find(k => k.name === 'right_ankle');

    if (nose && (leftAnkle || rightAnkle)) {
      const ankleY = leftAnkle && rightAnkle
        ? (leftAnkle.y + rightAnkle.y) / 2
        : (leftAnkle?.y || rightAnkle?.y || 0);
      
      const bodyHeight = Math.abs(ankleY - nose.y);
      if (bodyHeight < 0.1) {
        issues.push('人体高度异常，可能是远景');
      }
    }

    const isValid = issues.length === 0;

    return {
      isValid,
      validKeypoints: validKeypoints.length,
      totalKeypoints: keypoints.length,
      averageScore,
      issues
    };
  }

  isPoseStable(history: Keypoint[][], currentKeypoints: Keypoint[], windowSize: number = 5): boolean {
    if (history.length < windowSize) return false;

    const recentHistory = history.slice(-windowSize);
    let stableFrames = 0;

    for (const pastKeypoints of recentHistory) {
      const currentValid = currentKeypoints.filter(k => k.score >= this.minConfidence);
      const pastValid = pastKeypoints.filter(k => k.score >= this.minConfidence);

      if (Math.abs(currentValid.length - pastValid.length) <= 2) {
        stableFrames++;
      }
    }

    return stableFrames >= windowSize * 0.6;
  }
}
