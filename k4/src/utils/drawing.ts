import { Point, AttackDirection, FIELD_DIMENSIONS } from '../types';

export function drawFieldLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  attackDirection: AttackDirection
) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  const padding = 20;
  const fieldWidth = width - padding * 2;
  const fieldHeight = height - padding * 2;
  const scaleX = fieldWidth / FIELD_DIMENSIONS.width;
  const scaleY = fieldHeight / FIELD_DIMENSIONS.height;

  const toCanvasX = (x: number) => padding + x * scaleX;
  const toCanvasY = (y: number) => padding + y * scaleY;

  ctx.strokeRect(toCanvasX(0), toCanvasY(0), fieldWidth, fieldHeight);

  ctx.beginPath();
  ctx.moveTo(toCanvasX(FIELD_DIMENSIONS.width / 2), toCanvasY(0));
  ctx.lineTo(toCanvasX(FIELD_DIMENSIONS.width / 2), toCanvasY(FIELD_DIMENSIONS.height));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(
    toCanvasX(FIELD_DIMENSIONS.width / 2),
    toCanvasY(FIELD_DIMENSIONS.height / 2),
    FIELD_DIMENSIONS.centerCircleRadius * Math.min(scaleX, scaleY),
    0, Math.PI * 2
  );
  ctx.stroke();

  const drawPenaltyArea = (isLeft: boolean) => {
    const baseX = isLeft ? 0 : FIELD_DIMENSIONS.width;
    const dir = isLeft ? 1 : -1;
    const centerY = FIELD_DIMENSIONS.height / 2;

    ctx.strokeRect(
      toCanvasX(baseX),
      toCanvasY(centerY - FIELD_DIMENSIONS.penaltyAreaHeight / 2),
      FIELD_DIMENSIONS.penaltyAreaWidth * dir * scaleX,
      FIELD_DIMENSIONS.penaltyAreaHeight * scaleY
    );

    ctx.strokeRect(
      toCanvasX(baseX),
      toCanvasY(centerY - FIELD_DIMENSIONS.goalAreaHeight / 2),
      FIELD_DIMENSIONS.goalAreaWidth * dir * scaleX,
      FIELD_DIMENSIONS.goalAreaHeight * scaleY
    );

    ctx.beginPath();
    ctx.arc(
      toCanvasX(baseX + FIELD_DIMENSIONS.penaltySpotDistance * dir),
      toCanvasY(centerY),
      3, 0, Math.PI * 2
    );
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  };

  drawPenaltyArea(true);
  drawPenaltyArea(false);

  const arrowColor = attackDirection === 'left-to-right' ? '#00ff00' : '#ff4444';
  ctx.fillStyle = arrowColor;
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  const arrowText = attackDirection === 'left-to-right' ? '→ 进攻方向 →' : '← 进攻方向 ←';
  ctx.fillText(arrowText, width / 2, padding - 5);

  ctx.restore();
}

export function drawPlayerMark(
  ctx: CanvasRenderingContext2D,
  point: Point,
  type: 'attacker' | 'defender',
  label?: string
) {
  ctx.save();
  
  const radius = 12;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  
  if (type === 'attacker') {
    ctx.fillStyle = 'rgba(255, 68, 68, 0.8)';
    ctx.strokeStyle = '#ff0000';
  } else {
    ctx.fillStyle = 'rgba(68, 170, 255, 0.8)';
    ctx.strokeStyle = '#0088ff';
  }
  
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  if (label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, point.x, point.y);
  }

  ctx.restore();
}

export function drawOffsideLine(
  ctx: CanvasRenderingContext2D,
  xPosition: number,
  canvasHeight: number,
  isOffside: boolean
) {
  ctx.save();
  
  ctx.strokeStyle = isOffside ? '#ff0000' : '#00ff00';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 5]);
  
  ctx.beginPath();
  ctx.moveTo(xPosition, 0);
  ctx.lineTo(xPosition, canvasHeight);
  ctx.stroke();
  
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawCalibrationPoint(
  ctx: CanvasRenderingContext2D,
  point: Point,
  label: string,
  isSet: boolean
) {
  ctx.save();
  
  ctx.beginPath();
  ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
  
  if (isSet) {
    ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
    ctx.strokeStyle = '#00ff00';
  } else {
    ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
    ctx.strokeStyle = '#ffff00';
  }
  
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(label, point.x, point.y - 12);

  ctx.restore();
}
