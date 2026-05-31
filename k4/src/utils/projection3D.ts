import { Point, HomographyMatrix, AttackDirection, FIELD_DIMENSIONS } from '../types';
import { transformPoint, inverseHomography } from './homography';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Plane3D {
  normal: Point3D;
  distance: number;
}

export interface OffsidePlane3D {
  plane: Plane3D;
  corners: Point3D[];
  projectedCorners: Point[];
}

export interface CameraParams {
  focalLength: number;
  principalPoint: Point;
  rotation: number[];
  translation: number[];
}

export function createOffsidePlane(
  offsideLineX: number,
  attackDirection: AttackDirection,
  fieldWidth: number = FIELD_DIMENSIONS.height,
  planeHeight: number = 5
): OffsidePlane3D {
  const realWorldX = offsideLineX;
  
  const normal = attackDirection === 'left-to-right' 
    ? { x: -1, y: 0, z: 0 }
    : { x: 1, y: 0, z: 0 };
  
  const corners: Point3D[] = [
    { x: realWorldX, y: 0, z: 0 },
    { x: realWorldX, y: fieldWidth, z: 0 },
    { x: realWorldX, y: fieldWidth, z: planeHeight },
    { x: realWorldX, y: 0, z: planeHeight },
  ];
  
  return {
    plane: {
      normal,
      distance: -realWorldX,
    },
    corners,
    projectedCorners: [],
  };
}

export function estimateCameraParams(
  _homography: HomographyMatrix,
  canvasWidth: number,
  canvasHeight: number
): CameraParams {
  const focalLength = canvasWidth * 1.2;
  
  return {
    focalLength,
    principalPoint: { x: canvasWidth / 2, y: canvasHeight / 2 },
    rotation: [0, 0, 0],
    translation: [0, 0, 0],
  };
}

export function project3DTo2D(
  point3D: Point3D,
  homography: HomographyMatrix | null,
  canvasWidth: number,
  canvasHeight: number
): Point {
  if (homography) {
    const zFactor = 1 + point3D.z / 100;
    const basePoint = { x: point3D.x, y: point3D.y };
    const projected = transformPoint(basePoint, homography);
    
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    return {
      x: centerX + (projected.x - centerX) * zFactor,
      y: centerY + (projected.y - centerY) * zFactor - point3D.z * 3,
    };
  }
  
  const padding = 20;
  const fieldWidth = canvasWidth - padding * 2;
  const fieldHeight = canvasHeight - padding * 2;
  const scaleX = fieldWidth / FIELD_DIMENSIONS.width;
  const scaleY = fieldHeight / FIELD_DIMENSIONS.height;
  
  const zFactor = 1 + point3D.z / 100;
  const baseX = padding + point3D.x * scaleX;
  const baseY = padding + point3D.y * scaleY;
  
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  
  return {
    x: centerX + (baseX - centerX) * zFactor,
    y: centerY + (baseY - centerY) * zFactor - point3D.z * 3,
  };
}

export function drawOffsidePlane3D(
  ctx: CanvasRenderingContext2D,
  offsideLineX: number,
  attackDirection: AttackDirection,
  homography: HomographyMatrix | null,
  canvasWidth: number,
  canvasHeight: number,
  isOffside: boolean
) {
  const planeHeight = 8;
  const realOffsideX = convertScreenXToRealX(offsideLineX, homography, canvasWidth, canvasHeight);
  const plane = createOffsidePlane(realOffsideX, attackDirection, FIELD_DIMENSIONS.height, planeHeight);
  
  const projectedCorners = plane.corners.map(corner => 
    project3DTo2D(corner, homography, canvasWidth, canvasHeight)
  );
  
  ctx.save();
  
  const baseColor = isOffside ? [255, 68, 68] : [74, 222, 128];
  
  drawQuadWithGradient(
    ctx,
    projectedCorners[0],
    projectedCorners[1],
    projectedCorners[2],
    projectedCorners[3],
    baseColor,
    0.3,
    0.1
  );
  
  ctx.strokeStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.8)`;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  
  ctx.beginPath();
  ctx.moveTo(projectedCorners[0].x, projectedCorners[0].y);
  ctx.lineTo(projectedCorners[1].x, projectedCorners[1].y);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(projectedCorners[2].x, projectedCorners[2].y);
  ctx.lineTo(projectedCorners[3].x, projectedCorners[3].y);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(projectedCorners[0].x, projectedCorners[0].y);
  ctx.lineTo(projectedCorners[3].x, projectedCorners[3].y);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(projectedCorners[1].x, projectedCorners[1].y);
  ctx.lineTo(projectedCorners[2].x, projectedCorners[2].y);
  ctx.stroke();
  
  drawHorizontalLines(ctx, projectedCorners, baseColor, planeHeight);
  drawAttackDirectionArrow(ctx, projectedCorners, attackDirection, baseColor, isOffside);
  
  ctx.restore();
}

function drawQuadWithGradient(
  ctx: CanvasRenderingContext2D,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  color: number[],
  alphaTop: number,
  alphaBottom: number
) {
  const gradient = ctx.createLinearGradient(
    (p0.x + p1.x) / 2, p0.y,
    (p3.x + p2.x) / 2, p3.y
  );
  
  gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alphaTop})`);
  gradient.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alphaBottom})`);
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fill();
  
  ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.4)`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawHorizontalLines(
  ctx: CanvasRenderingContext2D,
  corners: Point[],
  color: number[],
  _height: number
) {
  const segments = 4;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const p0 = {
      x: corners[0].x + (corners[3].x - corners[0].x) * t,
      y: corners[0].y + (corners[3].y - corners[0].y) * t,
    };
    const p1 = {
      x: corners[1].x + (corners[2].x - corners[1].x) * t,
      y: corners[1].y + (corners[2].y - corners[1].y) * t,
    };
    
    ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.3 * (1 - t)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawAttackDirectionArrow(
  ctx: CanvasRenderingContext2D,
  corners: Point[],
  attackDirection: AttackDirection,
  color: number[],
  isOffside: boolean
) {
  const midTop = {
    x: (corners[2].x + corners[3].x) / 2,
    y: (corners[2].y + corners[3].y) / 2,
  };
  
  const arrowSize = 20;
  const direction = attackDirection === 'left-to-right' ? 1 : -1;
  
  ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.9)`;
  ctx.beginPath();
  ctx.moveTo(midTop.x + direction * arrowSize, midTop.y - 5);
  ctx.lineTo(midTop.x, midTop.y - 15);
  ctx.lineTo(midTop.x, midTop.y + 5);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    isOffside ? '越位平面' : '安全平面',
    midTop.x,
    midTop.y - 25
  );
}

function convertScreenXToRealX(
  screenX: number,
  homography: HomographyMatrix | null,
  canvasWidth: number,
  canvasHeight: number
): number {
  if (homography) {
    const invH = inverseHomography(homography);
    if (invH) {
      const point = transformPoint({ x: screenX, y: canvasHeight / 2 }, invH);
      return point.x;
    }
  }
  
  const padding = 20;
  const fieldWidth = canvasWidth - padding * 2;
  return ((screenX - padding) / fieldWidth) * FIELD_DIMENSIONS.width;
}

export function drawDepthGrid(
  ctx: CanvasRenderingContext2D,
  homography: HomographyMatrix | null,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  
  const gridSpacingX = FIELD_DIMENSIONS.width / 10;
  const gridSpacingY = FIELD_DIMENSIONS.height / 6;
  
  for (let x = 0; x <= FIELD_DIMENSIONS.width; x += gridSpacingX) {
    const p1 = project3DTo2D({ x, y: 0, z: 0 }, homography, canvasWidth, canvasHeight);
    const p2 = project3DTo2D({ x, y: FIELD_DIMENSIONS.height, z: 0 }, homography, canvasWidth, canvasHeight);
    
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  
  for (let y = 0; y <= FIELD_DIMENSIONS.height; y += gridSpacingY) {
    const p1 = project3DTo2D({ x: 0, y, z: 0 }, homography, canvasWidth, canvasHeight);
    const p2 = project3DTo2D({ x: FIELD_DIMENSIONS.width, y, z: 0 }, homography, canvasWidth, canvasHeight);
    
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawPlayerPositionIndicator(
  ctx: CanvasRenderingContext2D,
  _screenPosition: Point,
  realWorldPosition: Point | null,
  type: 'attacker' | 'defender',
  homography: HomographyMatrix | null,
  canvasWidth: number,
  canvasHeight: number
) {
  if (!realWorldPosition || !homography) return;
  
  const basePoint = project3DTo2D(
    { x: realWorldPosition.x, y: realWorldPosition.y, z: 0 },
    homography, canvasWidth, canvasHeight
  );
  
  const topPoint = project3DTo2D(
    { x: realWorldPosition.x, y: realWorldPosition.y, z: 1.8 },
    homography, canvasWidth, canvasHeight
  );
  
  ctx.save();
  
  const color = type === 'attacker' ? [255, 68, 68] : [68, 136, 255];
  
  ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.5)`;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  
  ctx.beginPath();
  ctx.moveTo(basePoint.x, basePoint.y);
  ctx.lineTo(topPoint.x, topPoint.y);
  ctx.stroke();
  
  ctx.setLineDash([]);
  
  ctx.beginPath();
  ctx.arc(basePoint.x, basePoint.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.6)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.8)`;
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(topPoint.x, topPoint.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.8)`;
  ctx.fill();
  
  ctx.restore();
}
