export interface Point {
  x: number;
  y: number;
}

export interface HomographyMatrix {
  h11: number; h12: number; h13: number;
  h21: number; h22: number; h23: number;
  h31: number; h32: number; h33: number;
}

export interface FieldCalibration {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
  centerSpot: Point;
  penaltySpotLeft: Point;
  penaltySpotRight: Point;
}

export interface CameraAngle {
  id: number;
  name: string;
  mediaType: 'image' | 'video' | null;
  mediaUrl: string | null;
  calibration: Partial<FieldCalibration>;
  homographyMatrix: HomographyMatrix | null;
  calibrationConfidence: 'low' | 'medium' | 'high';
  reprojectionError: number;
}

export interface PlayerMark {
  id: string;
  position: Point;
  realWorldPosition: Point | null;
  type: 'attacker' | 'defender';
  sourceCameraAngle: number;
}

export type AttackDirection = 'left-to-right' | 'right-to-left';

export interface OffsideState {
  attackDirection: AttackDirection;
  playerMarks: PlayerMark[];
  offsideLinePosition: number | null;
  isOffside: boolean | null;
}

export const FIELD_DIMENSIONS = {
  width: 105,
  height: 68,
  penaltyAreaWidth: 16.5,
  penaltyAreaHeight: 40.32,
  goalAreaWidth: 5.5,
  goalAreaHeight: 18.32,
  centerCircleRadius: 9.15,
  penaltySpotDistance: 11,
} as const;
