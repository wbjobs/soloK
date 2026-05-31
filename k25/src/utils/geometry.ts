import { Keypoint } from '../types';

export const calculateDistance = (p1: Keypoint, p2: Keypoint): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const calculateAngle = (p1: Keypoint, p2: Keypoint, p3: Keypoint): number => {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  const cos = dot / (mag1 * mag2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI);
};

export const calculateVerticalAngle = (top: Keypoint, bottom: Keypoint): number => {
  const dx = bottom.x - top.x;
  const dy = bottom.y - top.y;
  return Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
};

export const calculateBoundingBox = (keypoints: Keypoint[]) => {
  const xs = keypoints.map(k => k.x);
  const ys = keypoints.map(k => k.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
};

export const calculateBodyHeight = (keypoints: Keypoint[]): number => {
  const nose = keypoints.find(k => k.name === 'nose');
  const leftAnkle = keypoints.find(k => k.name === 'left_ankle');
  const rightAnkle = keypoints.find(k => k.name === 'right_ankle');
  
  if (!nose || (!leftAnkle && !rightAnkle)) return 0;
  
  const ankleY = leftAnkle && rightAnkle 
    ? (leftAnkle.y + rightAnkle.y) / 2 
    : (leftAnkle?.y || rightAnkle?.y || 0);
  
  return Math.abs(ankleY - nose.y);
};

export const calculateBodyWidth = (keypoints: Keypoint[]): number => {
  const leftHip = keypoints.find(k => k.name === 'left_hip');
  const rightHip = keypoints.find(k => k.name === 'right_hip');
  if (!leftHip || !rightHip) return 0;
  return calculateDistance(leftHip, rightHip);
};

export const getKeypoint = (keypoints: Keypoint[], name: string): Keypoint | undefined => {
  return keypoints.find(k => k.name === name);
};
