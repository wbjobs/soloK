import React from 'react';
import { FieldCalibration } from '../types';

interface CalibrationPanelProps {
  activePoint: keyof FieldCalibration | null;
  calibrationPoints: Partial<FieldCalibration>;
  onSelectPoint: (point: keyof FieldCalibration | null) => void;
  onClearCalibration: () => void;
  calibrationQuality?: 'low' | 'medium' | 'high';
  reprojectionError?: number;
}

const calibrationPointLabels: Record<keyof FieldCalibration, string> = {
  topLeft: '左上角',
  topRight: '右上角',
  bottomLeft: '左下角',
  bottomRight: '右下角',
  centerSpot: '中点',
  penaltySpotLeft: '左点球点',
  penaltySpotRight: '右点球点',
};

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({
  activePoint,
  calibrationPoints,
  onSelectPoint,
  onClearCalibration,
  calibrationQuality,
  reprojectionError,
}) => {
  const points: (keyof FieldCalibration)[] = [
    'topLeft', 'topRight', 'bottomLeft', 'bottomRight',
    'centerSpot', 'penaltySpotLeft', 'penaltySpotRight'
  ];

  const setCount = Object.keys(calibrationPoints).length;

  return (
    <div className="calibration-panel">
      <h3>透视校准</h3>
      <p className="calibration-hint">
        点击下方按钮选择要校准的点，然后在图片上点击对应位置
      </p>
      <p className="calibration-progress">
        已设置: {setCount} / 7 个点
      </p>
      
      <div className="calibration-points">
        {points.map((point) => (
          <button
            key={point}
            className={`calibration-point-btn ${
              calibrationPoints[point] ? 'set' : ''
            } ${activePoint === point ? 'active' : ''}`}
            onClick={() => onSelectPoint(activePoint === point ? null : point)}
          >
            {calibrationPointLabels[point]}
            {calibrationPoints[point] && <span className="check">✓</span>}
          </button>
        ))}
      </div>

      {setCount >= 4 && calibrationQuality && calibrationQuality !== 'low' && (
        <div className={`calibration-status ${calibrationQuality}`}>
          <span className="status-icon">✓</span>
          <div className="status-text">
            <div>透视校正已启用</div>
            <div className="quality-badge">
              精度: {calibrationQuality === 'high' ? '高' : '中'}
              {reprojectionError !== Infinity && (
                <span className="error-info"> | 误差: {reprojectionError?.toFixed(1)}px</span>
              )}
            </div>
          </div>
        </div>
      )}
      
      {setCount >= 4 && calibrationQuality === 'low' && (
        <div className="calibration-status warning">
          <span className="status-icon">⚠</span>
          <div className="status-text">
            <div>校准质量较低，建议重新设置校准点</div>
            <div className="quality-hint">
              提示：确保校准点准确对应球场标线交叉点
            </div>
          </div>
        </div>
      )}

      <button className="clear-calibration-btn" onClick={onClearCalibration}>
        清除所有校准点
      </button>
    </div>
  );
};
