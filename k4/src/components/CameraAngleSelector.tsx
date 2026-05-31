import React from 'react';
import { CameraAngle } from '../types';

interface CameraAngleSelectorProps {
  angles: CameraAngle[];
  currentAngle: number;
  onAngleChange: (id: number) => void;
  onAddAngle: () => void;
  onRemoveAngle: (id: number) => void;
  maxAngles: number;
}

export const CameraAngleSelector: React.FC<CameraAngleSelectorProps> = ({
  angles,
  currentAngle,
  onAngleChange,
  onAddAngle,
  onRemoveAngle,
  maxAngles,
}) => {
  return (
    <div className="camera-angle-selector">
      <h4>机位角度</h4>
      <div className="angle-tabs">
        {angles.map((angle) => (
          <div
            key={angle.id}
            className={`angle-tab ${currentAngle === angle.id ? 'active' : ''}`}
            onClick={() => onAngleChange(angle.id)}
          >
            <span>{angle.name}</span>
            {angles.length > 1 && (
              <button
                className="remove-angle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveAngle(angle.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {angles.length < maxAngles && (
          <button className="add-angle-btn" onClick={onAddAngle}>
            + 添机位
          </button>
        )}
      </div>
    </div>
  );
};
