import React from 'react';
import { AttackDirection } from '../types';
import { drawFieldLines } from '../utils/drawing';

interface FieldPlanProps {
  width: number;
  height: number;
  attackDirection: AttackDirection;
  onAttackDirectionChange: (direction: AttackDirection) => void;
}

export const FieldPlan: React.FC<FieldPlanProps> = ({
  width,
  height,
  attackDirection,
  onAttackDirectionChange,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a472a';
    ctx.fillRect(0, 0, width, height);

    drawFieldLines(ctx, width, height, attackDirection);
  }, [width, height, attackDirection]);

  return (
    <div className="field-plan">
      <h4>球场平面图 - 选择进攻方向</h4>
      <canvas ref={canvasRef} width={width} height={height} />
      <div className="direction-buttons">
        <button
          className={`direction-btn ${attackDirection === 'left-to-right' ? 'active' : ''}`}
          onClick={() => onAttackDirectionChange('left-to-right')}
        >
          左攻右 →
        </button>
        <button
          className={`direction-btn ${attackDirection === 'right-to-left' ? 'active' : ''}`}
          onClick={() => onAttackDirectionChange('right-to-left')}
        >
          ← 右攻左
        </button>
      </div>
    </div>
  );
};
