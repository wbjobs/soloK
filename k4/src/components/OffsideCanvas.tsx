import { useRef, useEffect, useCallback } from 'react';
import { Point, PlayerMark, FieldCalibration, HomographyMatrix, AttackDirection } from '../types';
import { drawPlayerMark, drawOffsideLine, drawCalibrationPoint } from '../utils/drawing';
import { drawOffsidePlane3D, drawDepthGrid, drawPlayerPositionIndicator } from '../utils/projection3D';
import { TrackedPoint } from '../utils/opticalFlow';

interface OffsideCanvasProps {
  width: number;
  height: number;
  mediaElement: HTMLVideoElement | HTMLImageElement | null;
  playerMarks: PlayerMark[];
  offsideLinePosition: number | null;
  isOffside: boolean | null;
  calibrationMode: boolean;
  calibrationPoints: Partial<FieldCalibration>;
  activeCalibrationPoint: keyof FieldCalibration | null;
  onCanvasClick: (point: Point) => void;
  attackDirection: AttackDirection;
  homographyMatrix?: HomographyMatrix | null;
  trackedPoints?: TrackedPoint[];
  show3DPlane?: boolean;
  showDepthGrid?: boolean;
  showTrackingIndicator?: boolean;
}

export const OffsideCanvas: React.FC<OffsideCanvasProps> = ({
  width,
  height,
  mediaElement,
  playerMarks,
  offsideLinePosition,
  isOffside,
  calibrationMode,
  calibrationPoints,
  activeCalibrationPoint,
  onCanvasClick,
  attackDirection,
  homographyMatrix,
  trackedPoints = [],
  show3DPlane = false,
  showDepthGrid = false,
  showTrackingIndicator = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    onCanvasClick({ x, y });
  }, [onCanvasClick]);

  const drawTrackingIndicator = useCallback((ctx: CanvasRenderingContext2D, point: TrackedPoint) => {
    const { position, velocity, confidence, type } = point;
    
    const baseColor = type === 'attacker' ? '255, 68, 68' : '68, 136, 255';
    
    if (showTrackingIndicator) {
      ctx.save();
      
      ctx.strokeStyle = `rgba(${baseColor}, ${0.3 + confidence * 0.4})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      
      ctx.beginPath();
      ctx.arc(position.x, position.y, 18 + confidence * 8, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.setLineDash([]);
      
      const arrowLength = Math.min(Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y) * 3, 30);
      if (arrowLength > 5) {
        const angle = Math.atan2(velocity.y, velocity.x);
        ctx.strokeStyle = `rgba(${baseColor}, 0.8)`;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(position.x, position.y);
        ctx.lineTo(
          position.x + Math.cos(angle) * arrowLength,
          position.y + Math.sin(angle) * arrowLength
        );
        ctx.stroke();
        
        const arrowHeadLength = 8;
        ctx.beginPath();
        ctx.moveTo(
          position.x + Math.cos(angle) * arrowLength,
          position.y + Math.sin(angle) * arrowLength
        );
        ctx.lineTo(
          position.x + Math.cos(angle) * arrowLength - Math.cos(angle - 0.4) * arrowHeadLength,
          position.y + Math.sin(angle) * arrowLength - Math.sin(angle - 0.4) * arrowHeadLength
        );
        ctx.lineTo(
          position.x + Math.cos(angle) * arrowLength - Math.cos(angle + 0.4) * arrowHeadLength,
          position.y + Math.sin(angle) * arrowLength - Math.sin(angle + 0.4) * arrowHeadLength
        );
        ctx.closePath();
        ctx.fillStyle = `rgba(${baseColor}, 0.8)`;
        ctx.fill();
      }
      
      ctx.restore();
    }
  }, [showTrackingIndicator]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (mediaElement) {
      ctx.drawImage(mediaElement, 0, 0, width, height);
    }

    if (calibrationMode) {
      const calibrationLabels: Record<keyof FieldCalibration, string> = {
        topLeft: '左上角',
        topRight: '右上角',
        bottomLeft: '左下角',
        bottomRight: '右下角',
        centerSpot: '中点',
        penaltySpotLeft: '左点球点',
        penaltySpotRight: '右点球点',
      };

      Object.entries(calibrationPoints).forEach(([key, point]) => {
        if (point) {
          drawCalibrationPoint(
            ctx,
            point,
            calibrationLabels[key as keyof FieldCalibration],
            true
          );
        }
      });

      if (activeCalibrationPoint && !calibrationPoints[activeCalibrationPoint]) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          `点击设置: ${calibrationLabels[activeCalibrationPoint]}`,
          width / 2,
          height / 2
        );
      }
    } else {
      if (showDepthGrid && homographyMatrix) {
        drawDepthGrid(ctx, homographyMatrix, width, height);
      }

      if (show3DPlane && offsideLinePosition !== null && isOffside !== null) {
        drawOffsidePlane3D(
          ctx,
          offsideLinePosition,
          attackDirection,
          homographyMatrix || null,
          width,
          height,
          isOffside
        );
      }

      playerMarks.forEach((mark) => {
        const marksOfType = playerMarks.filter(m => m.type === mark.type);
        const labelIndex = marksOfType.indexOf(mark) + 1;
        drawPlayerMark(ctx, mark.position, mark.type, labelIndex.toString());
        
        if (show3DPlane && homographyMatrix) {
          drawPlayerPositionIndicator(
            ctx,
            mark.position,
            mark.realWorldPosition,
            mark.type,
            homographyMatrix,
            width,
            height
          );
        }
      });

      trackedPoints.forEach(trackedPoint => {
        drawTrackingIndicator(ctx, trackedPoint);
      });

      if (!show3DPlane && offsideLinePosition !== null && isOffside !== null) {
        drawOffsideLine(ctx, offsideLinePosition, height, isOffside);
      }
    }
  }, [
    width,
    height,
    mediaElement,
    playerMarks,
    offsideLinePosition,
    isOffside,
    calibrationMode,
    calibrationPoints,
    activeCalibrationPoint,
    attackDirection,
    homographyMatrix,
    trackedPoints,
    show3DPlane,
    showDepthGrid,
    drawTrackingIndicator,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      className="offside-canvas"
      style={{ cursor: calibrationMode || playerMarks.length > 0 ? 'crosshair' : 'default' }}
    />
  );
};
