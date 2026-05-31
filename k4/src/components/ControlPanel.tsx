import { PlayerMark } from '../types';

interface ControlPanelProps {
  markMode: 'attacker' | 'defender' | null;
  onMarkModeChange: (mode: 'attacker' | 'defender' | null) => void;
  playerMarks: PlayerMark[];
  onClearMarks: () => void;
  onDeleteMark: (id: string) => void;
  calibrationMode: boolean;
  onCalibrationModeChange: (mode: boolean) => void;
  onExport: () => void;
  isOffside: boolean | null;
  syncMarks?: boolean;
  onSyncMarksChange?: (sync: boolean) => void;
  calibrationQuality?: 'low' | 'medium' | 'high';
  autoTracking?: boolean;
  onAutoTrackingChange?: (enabled: boolean) => void;
  isTracking?: boolean;
  trackingConfidence?: number;
  onStartTracking?: () => void;
  onStopTracking?: () => void;
  show3DPlane?: boolean;
  onShow3DPlaneChange?: (show: boolean) => void;
  showDepthGrid?: boolean;
  onShowDepthGridChange?: (show: boolean) => void;
  hasMarks?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  markMode,
  onMarkModeChange,
  playerMarks,
  onClearMarks,
  onDeleteMark,
  calibrationMode,
  onCalibrationModeChange,
  onExport,
  isOffside,
  syncMarks,
  onSyncMarksChange,
  calibrationQuality,
  autoTracking = false,
  onAutoTrackingChange,
  isTracking = false,
  trackingConfidence = 0,
  onStartTracking,
  onStopTracking,
  show3DPlane = false,
  onShow3DPlaneChange,
  showDepthGrid = false,
  onShowDepthGridChange,
  hasMarks = false,
}) => {
  const attackers = playerMarks.filter(m => m.type === 'attacker');
  const defenders = playerMarks.filter(m => m.type === 'defender');

  return (
    <div className="control-panel">
      <h3>控制面板</h3>
      
      {calibrationQuality && calibrationQuality !== 'low' && (
        <div className={`quality-indicator ${calibrationQuality}`}>
          <span className="quality-icon">✓</span>
          <span>透视校正: {calibrationQuality === 'high' ? '高精度' : '中等精度'}</span>
        </div>
      )}
      
      <div className="panel-section">
        <h4>光流追踪</h4>
        <div className="tracking-controls">
          {onAutoTrackingChange && (
            <label className="tracking-option">
              <input
                type="checkbox"
                checked={autoTracking}
                onChange={(e) => onAutoTrackingChange(e.target.checked)}
              />
              <span>启用光流追踪</span>
              <span className="tracking-hint">播放视频时自动追踪已标记球员</span>
            </label>
          )}
          
          {autoTracking && hasMarks && (
            <div className="tracking-buttons">
              {!isTracking ? (
                <button 
                  className="tracking-btn start" 
                  onClick={onStartTracking}
                >
                  <span className="tracking-icon">▶</span>
                  开始追踪
                </button>
              ) : (
                <button 
                  className="tracking-btn stop" 
                  onClick={onStopTracking}
                >
                  <span className="tracking-icon">■</span>
                  停止追踪
                </button>
              )}
            </div>
          )}
          
          {isTracking && (
            <div className="tracking-status">
              <div className="status-row">
                <span className="status-label">追踪状态:</span>
                <span className="status-value active">
                  <span className="pulse-dot" />
                  追踪中
                </span>
              </div>
              <div className="status-row">
                <span className="status-label">置信度:</span>
                <span className={`status-value ${trackingConfidence > 0.7 ? 'high' : trackingConfidence > 0.4 ? 'medium' : 'low'}`}>
                  {(trackingConfidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="confidence-bar">
                <div 
                  className={`confidence-fill ${trackingConfidence > 0.7 ? 'high' : trackingConfidence > 0.4 ? 'medium' : 'low'}`}
                  style={{ width: `${trackingConfidence * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <p className="hint">
          💡 基于Farneback光流算法，自动追踪球员在视频中的移动
        </p>
      </div>

      <div className="panel-section">
        <h4>3D 视角</h4>
        <div className="view-controls">
          {onShow3DPlaneChange && (
            <label className="view-option">
              <input
                type="checkbox"
                checked={show3DPlane}
                onChange={(e) => onShow3DPlaneChange(e.target.checked)}
              />
              <span>显示3D越位平面</span>
              <span className="view-hint">立体显示越位线平面投影效果</span>
            </label>
          )}
          
          {onShowDepthGridChange && (
            <label className="view-option">
              <input
                type="checkbox"
                checked={showDepthGrid}
                onChange={(e) => onShowDepthGridChange(e.target.checked)}
              />
              <span>显示深度网格</span>
              <span className="view-hint">辅助透视校正的空间感知</span>
            </label>
          )}
        </div>
        <p className="hint">
          💡 3D越位平面基于透视校正参数，需先完成球场校准
        </p>
      </div>

      <div className="panel-section">
        <h4>标记模式</h4>
        <div className="mode-buttons">
          <button
            className={`mode-btn attacker ${markMode === 'attacker' ? 'active' : ''}`}
            onClick={() => onMarkModeChange(markMode === 'attacker' ? null : 'attacker')}
          >
            <span className="dot red" />
            标记攻方
          </button>
          <button
            className={`mode-btn defender ${markMode === 'defender' ? 'active' : ''}`}
            onClick={() => onMarkModeChange(markMode === 'defender' ? null : 'defender')}
          >
            <span className="dot blue" />
            标记守方
          </button>
        </div>
      </div>

      <div className="panel-section">
        <h4>已标记球员</h4>
        <div className="marks-list">
          <div className="marks-group">
            <span className="group-label">攻方 ({attackers.length}):</span>
            {attackers.map((mark, i) => (
              <button
                key={mark.id}
                className="mark-tag attacker"
                onClick={() => onDeleteMark(mark.id)}
              >
                A{i + 1} ×
              </button>
            ))}
          </div>
          <div className="marks-group">
            <span className="group-label">守方 ({defenders.length}):</span>
            {defenders.map((mark, i) => (
              <button
                key={mark.id}
                className="mark-tag defender"
                onClick={() => onDeleteMark(mark.id)}
              >
                D{i + 1} ×
              </button>
            ))}
          </div>
        </div>
        <button className="clear-btn" onClick={onClearMarks}>
          清除所有标记
        </button>
      </div>

      <div className="panel-section">
        <h4>透视校正</h4>
        <button
          className={`calibration-btn ${calibrationMode ? 'active' : ''}`}
          onClick={() => onCalibrationModeChange(!calibrationMode)}
        >
          {calibrationMode ? '退出校准模式' : '进入校准模式'}
        </button>
        <p className="hint">校准后可获得更精确的越位判定</p>
        
        {onSyncMarksChange && (
          <label className="sync-option">
            <input
              type="checkbox"
              checked={syncMarks ?? true}
              onChange={(e) => onSyncMarksChange(e.target.checked)}
            />
            <span>同步多机位标记</span>
            <span className="sync-hint">在已校准机位间自动映射球员位置</span>
          </label>
        )}
      </div>

      <div className="panel-section">
        <h4>越位判定结果</h4>
        <div className={`result-box ${isOffside === null ? 'pending' : isOffside ? 'offside' : 'onside'}`}>
          {isOffside === null ? (
            <span>请标记至少2名防守球员和1名进攻球员</span>
          ) : isOffside ? (
            <span className="result offside">越位 OFFSIDE</span>
          ) : (
            <span className="result onside">不越位 ONSIDE</span>
          )}
        </div>
      </div>

      <div className="panel-section">
        <button className="export-btn" onClick={onExport}>
          导出判定结果图片
        </button>
      </div>
    </div>
  );
};
