import { Keypoint } from '../types';
import { calculateDistance, getKeypoint } from './geometry';

export type AgeGroup = 'child' | 'adult' | 'elderly';

export interface AgeEstimate {
  ageGroup: AgeGroup;
  confidence: number;
  shoulderHipRatio: number;
  armLengthRatio: number;
  legLengthRatio: number;
  estimatedHeight: number;
}

export class AgeEstimator {
  private static readonly ADULT_SHOULDER_HIP_RATIO = 0.7;
  private static readonly CHILD_SHOULDER_HIP_RATIO = 0.5;
  private static readonly ELDERLY_SHOULDER_HIP_RATIO = 0.75;

  private static readonly ADULT_ARM_LENGTH_RATIO = 1.4;
  private static readonly CHILD_ARM_LENGTH_RATIO = 1.0;
  private static readonly ELDERLY_ARM_LENGTH_RATIO = 1.2;

  private static readonly ADULT_LEG_LENGTH_RATIO = 1.8;
  private static readonly CHILD_LEG_LENGTH_RATIO = 1.4;
  private static readonly ELDERLY_LEG_LENGTH_RATIO = 1.5;

  static estimate(keypoints: Keypoint[]): AgeEstimate {
    const leftShoulder = getKeypoint(keypoints, 'left_shoulder');
    const rightShoulder = getKeypoint(keypoints, 'right_shoulder');
    const leftHip = getKeypoint(keypoints, 'left_hip');
    const rightHip = getKeypoint(keypoints, 'right_hip');
    const leftElbow = getKeypoint(keypoints, 'left_elbow');
    const rightElbow = getKeypoint(keypoints, 'right_elbow');
    const leftWrist = getKeypoint(keypoints, 'left_wrist');
    const rightWrist = getKeypoint(keypoints, 'right_wrist');
    const leftKnee = getKeypoint(keypoints, 'left_knee');
    const rightKnee = getKeypoint(keypoints, 'right_knee');
    const leftAnkle = getKeypoint(keypoints, 'left_ankle');
    const rightAnkle = getKeypoint(keypoints, 'right_ankle');
    const nose = getKeypoint(keypoints, 'nose');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return {
        ageGroup: 'adult',
        confidence: 0.5,
        shoulderHipRatio: 0,
        armLengthRatio: 0,
        legLengthRatio: 0,
        estimatedHeight: 0
      };
    }

    const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);
    const hipWidth = calculateDistance(leftHip, rightHip);
    const shoulderHipDistance = calculateDistance(
      { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2, score: 1, name: 'shoulder_center' },
      { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2, score: 1, name: 'hip_center' }
    );

    const shoulderHipRatio = shoulderHipDistance > 0 ? shoulderWidth / shoulderHipDistance : 0;

    let armLength = 0;
    if (leftShoulder && leftElbow && leftWrist) {
      const upperArm = calculateDistance(leftShoulder, leftElbow);
      const forearm = calculateDistance(leftElbow, leftWrist);
      armLength = upperArm + forearm;
    } else if (rightShoulder && rightElbow && rightWrist) {
      const upperArm = calculateDistance(rightShoulder, rightElbow);
      const forearm = calculateDistance(rightElbow, rightWrist);
      armLength = upperArm + forearm;
    }

    const armLengthRatio = shoulderHipDistance > 0 ? armLength / shoulderHipDistance : 0;

    let legLength = 0;
    if (leftHip && leftKnee && leftAnkle) {
      const thigh = calculateDistance(leftHip, leftKnee);
      const calf = calculateDistance(leftKnee, leftAnkle);
      legLength = thigh + calf;
    } else if (rightHip && rightKnee && rightAnkle) {
      const thigh = calculateDistance(rightHip, rightKnee);
      const calf = calculateDistance(rightKnee, rightAnkle);
      legLength = thigh + calf;
    }

    const legLengthRatio = shoulderHipDistance > 0 ? legLength / shoulderHipDistance : 0;

    let totalHeight = 0;
    if (nose) {
      const noseY = nose.y;
      const ankleY = leftAnkle || rightAnkle ? (leftAnkle?.y || rightAnkle?.y || 0) : 0;
      totalHeight = Math.abs(ankleY - noseY);
    }

    let childScore = 0;
    let adultScore = 0;
    let elderlyScore = 0;

    if (shoulderHipRatio < this.CHILD_SHOULDER_HIP_RATIO + 0.1) {
      childScore += 0.4;
    } else if (shoulderHipRatio > this.ELDERLY_SHOULDER_HIP_RATIO) {
      elderlyScore += 0.3;
    } else if (shoulderHipRatio >= this.ADULT_SHOULDER_HIP_RATIO - 0.1) {
      adultScore += 0.3;
    }

    if (armLengthRatio < this.CHILD_ARM_LENGTH_RATIO + 0.2) {
      childScore += 0.3;
    } else if (armLengthRatio < this.ELDERLY_ARM_LENGTH_RATIO + 0.1) {
      elderlyScore += 0.25;
    } else if (armLengthRatio >= this.ADULT_ARM_LENGTH_RATIO - 0.2) {
      adultScore += 0.25;
    }

    if (legLengthRatio < this.CHILD_LEG_LENGTH_RATIO + 0.2) {
      childScore += 0.3;
    } else if (legLengthRatio < this.ELDERLY_LEG_LENGTH_RATIO + 0.1) {
      elderlyScore += 0.25;
    } else if (legLengthRatio >= this.ADULT_LEG_LENGTH_RATIO - 0.2) {
      adultScore += 0.25;
    }

    if (totalHeight < 0.3) {
      childScore += 0.2;
    } else if (totalHeight > 0.6) {
      adultScore += 0.2;
    }

    if (hipWidth > shoulderWidth * 1.1) {
      elderlyScore += 0.2;
    }

    let ageGroup: AgeGroup = 'adult';
    let confidence = 0.5;

    const maxScore = Math.max(childScore, adultScore, elderlyScore);
    
    if (maxScore === childScore && childScore > 0.3) {
      ageGroup = 'child';
      confidence = childScore;
    } else if (maxScore === elderlyScore && elderlyScore > 0.3) {
      ageGroup = 'elderly';
      confidence = elderlyScore;
    } else {
      ageGroup = 'adult';
      confidence = adultScore || 0.5;
    }

    confidence = Math.min(0.9, Math.max(0.3, confidence));

    return {
      ageGroup,
      confidence,
      shoulderHipRatio,
      armLengthRatio,
      legLengthRatio,
      estimatedHeight: totalHeight
    };
  }

  static getFallThreshold(ageGroup: AgeGroup): {
    angleThreshold: number;
    heightDropRatio: number;
    description: string;
  } {
    switch (ageGroup) {
      case 'elderly':
        return {
          angleThreshold: 45,
          heightDropRatio: 0.35,
          description: '老人摔倒检测'
        };
      case 'child':
        return {
          angleThreshold: 55,
          heightDropRatio: 0.45,
          description: '儿童摔倒检测'
        };
      case 'adult':
      default:
        return {
          angleThreshold: 60,
          heightDropRatio: 0.5,
          description: '成人摔倒检测'
        };
    }
  }

  static getAgeGroupName(ageGroup: AgeGroup): string {
    const names: Record<AgeGroup, string> = {
      child: '儿童',
      adult: '成人',
      elderly: '老人'
    };
    return names[ageGroup];
  }

  static getAgeGroupColor(ageGroup: AgeGroup): string {
    const colors: Record<AgeGroup, string> = {
      child: '#22C55E',
      adult: '#3B82F6',
      elderly: '#F59E0B'
    };
    return colors[ageGroup];
  }
}
