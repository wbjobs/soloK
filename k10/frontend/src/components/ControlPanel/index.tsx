import { useState, useEffect } from 'react';
import { useDeviceStore } from '../../store/deviceStore';
import { commandApi, limitApi, calibrationApi, logApi, telemetryApi } from '../../services/api';
import type { ControlCommand, VirtualLimit, CalibrationReport, OperationLog } from '../../types';

interface ControlPanelProps {
  activeTab: 'control' | 'limits' | 'calibration' | 'logs';
}

export default function ControlPanel({ activeTab }: ControlPanelProps) {
  switch (activeTab) {
    case 'control':
      return <DeviceControlTab />;
    case 'limits':
      return <VirtualLimitsTab />;
    case 'calibration':
      return <CalibrationTab />;
    case 'logs':
      return <LogsTab />;
    default:
      return null;
  }
}

function DeviceControlTab() {
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId);
  const devices = useDeviceStore((s) => s.devices);
  const telemetry = useDeviceStore((s) => s.telemetry);
  const locks = useDeviceStore((s) => s.locks);
  const setLocks = useDeviceStore((s) => s.setLocks);

  const [targetX, setTargetX] = useState(0);
  const [targetY, setTargetY] = useState(0);
  const [targetZ, setTargetZ] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  const tel = selectedDeviceId ? telemetry.get(selectedDeviceId) : undefined;

  useEffect(() => {
    const refreshLocks = async () => {
      try {
        const res = await commandApi.listLocks();
        setLocks(res.data);
      } catch {}
    };
    refreshLocks();
    const interval = setInterval(refreshLocks, 5000);
    return () => clearInterval(interval);
  }, [setLocks]);

  const handleRoboticArmMove = async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    try {
      await commandApi.send(selectedDeviceId, 'robotic_arm_move', {
        x: targetX, y: targetY, z: targetZ, speed
      });
      alert('移动指令已发送');
    } catch (err: any) {
      alert(err.response?.data?.error || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const handleConveyorControl = async (start: boolean) => {
    if (!selectedDeviceId) return;
    setLoading(true);
    try {
      await commandApi.send(selectedDeviceId, start ? 'conveyor_start' : 'conveyor_stop', { speed });
      alert(start ? '传送带启动指令已发送' : '传送带停止指令已发送');
    } catch (err: any) {
      alert(err.response?.data?.error || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVisionCapture = async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    try {
      await commandApi.send(selectedDeviceId, 'vision_capture');
      alert('拍照指令已发送');
    } catch (err: any) {
      alert(err.response?.data?.error || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  if (!selectedDevice) {
    return (
      <div className="panel-body">
        <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>
          请从左侧选择一个设备
        </p>
      </div>
    );
  }

  const deviceLock = locks.find((l) => l.device_id === selectedDeviceId);

  return (
    <div className="panel-body">
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{selectedDevice.name}</h3>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>类型: {selectedDevice.type}</p>
      </div>

      {tel && (
        <div className="telemetry-display" style={{ marginBottom: 16 }}>
          <div className="telemetry-item">
            <div className="telemetry-label">温度</div>
            <div className={`telemetry-value ${tel.temperature > 70 ? 'danger' : tel.temperature > 50 ? 'warning' : ''}`}>
              {tel.temperature.toFixed(1)}°C
            </div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-label">振动</div>
            <div className={`telemetry-value ${tel.vibration > 4 ? 'danger' : tel.vibration > 2 ? 'warning' : ''}`}>
              {tel.vibration.toFixed(2)} mm/s
            </div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-label">电流</div>
            <div className={`telemetry-value ${tel.current > 15 ? 'danger' : tel.current > 10 ? 'warning' : ''}`}>
              {tel.current.toFixed(1)} A
            </div>
          </div>
          <div className="telemetry-item">
            <div className="telemetry-label">速度</div>
            <div className="telemetry-value">{tel.velocity_magnitude.toFixed(2)} m/s</div>
          </div>
        </div>
      )}

      {deviceLock && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid #ef4444',
          borderRadius: 4,
          fontSize: 12,
          color: '#fca5a5',
          marginBottom: 12
        }}>
          设备已被 {deviceLock.username} 锁定
        </div>
      )}

      {selectedDevice.type === 'robotic_arm' && (
        <>
          <h4 style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>机械臂控制</h4>
          <div className="form-group">
            <label>目标 X 坐标</label>
            <input type="number" step="0.01" value={targetX} onChange={(e) => setTargetX(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label>目标 Y 坐标</label>
            <input type="number" step="0.01" value={targetY} onChange={(e) => setTargetY(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label>目标 Z 坐标</label>
            <input type="number" step="0.01" value={targetZ} onChange={(e) => setTargetZ(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label>速度 (0.1 - 2.0)</label>
            <input type="number" step="0.1" min="0.1" max="2.0" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value) || 1)} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleRoboticArmMove} disabled={loading || !!deviceLock}>
            移动到目标位置
          </button>
        </>
      )}

      {selectedDevice.type === 'conveyor_belt' && (
        <>
          <h4 style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>传送带控制</h4>
          <div className="form-group">
            <label>速度 (0 - 5)</label>
            <input type="number" step="0.1" min="0" max="5" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value) || 0)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ flex: 1 }} onClick={() => handleConveyorControl(true)} disabled={loading || !!deviceLock}>
              启动
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => handleConveyorControl(false)} disabled={loading || !!deviceLock}>
              停止
            </button>
          </div>
        </>
      )}

      {selectedDevice.type === 'vision_inspector' && (
        <>
          <h4 style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>视觉检测控制</h4>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleVisionCapture} disabled={loading || !!deviceLock}>
            拍照检测
          </button>
        </>
      )}
    </div>
  );
}

function VirtualLimitsTab() {
  const virtualLimits = useDeviceStore((s) => s.virtualLimits);
  const setVirtualLimits = useDeviceStore((s) => s.setVirtualLimits);
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId);
  const [loading, setLoading] = useState(false);

  const [newLimit, setNewLimit] = useState({
    device_id: '',
    x_min: -2, x_max: 2,
    y_min: 0, y_max: 3,
    z_min: -2, z_max: 2,
    color: '#00ff00',
    opacity: 0.2
  });

  const refreshLimits = async () => {
    try {
      const res = await limitApi.list();
      setVirtualLimits(res.data);
    } catch {}
  };

  useEffect(() => {
    refreshLimits();
  }, [setVirtualLimits]);

  const handleCreate = async () => {
    if (!newLimit.device_id) {
      alert('请选择设备');
      return;
    }
    setLoading(true);
    try {
      await limitApi.create(newLimit);
      refreshLimits();
      alert('虚拟限位已创建');
    } catch (err: any) {
      alert(err.response?.data?.error || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await limitApi.delete(id);
      refreshLimits();
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败');
    }
  };

  return (
    <div className="panel-body">
      <h4 style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>创建虚拟限位</h4>
      <div className="form-group">
        <label>设备 ID</label>
        <input
          type="text"
          value={newLimit.device_id || selectedDeviceId || ''}
          onChange={(e) => setNewLimit({ ...newLimit, device_id: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>X 范围</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" step="0.1" value={newLimit.x_min} onChange={(e) => setNewLimit({ ...newLimit, x_min: parseFloat(e.target.value) || 0 })} />
          <input type="number" step="0.1" value={newLimit.x_max} onChange={(e) => setNewLimit({ ...newLimit, x_max: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="form-group">
        <label>Y 范围</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" step="0.1" value={newLimit.y_min} onChange={(e) => setNewLimit({ ...newLimit, y_min: parseFloat(e.target.value) || 0 })} />
          <input type="number" step="0.1" value={newLimit.y_max} onChange={(e) => setNewLimit({ ...newLimit, y_max: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="form-group">
        <label>Z 范围</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" step="0.1" value={newLimit.z_min} onChange={(e) => setNewLimit({ ...newLimit, z_min: parseFloat(e.target.value) || 0 })} />
          <input type="number" step="0.1" value={newLimit.z_max} onChange={(e) => setNewLimit({ ...newLimit, z_max: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="form-group">
        <label>颜色</label>
        <input type="color" value={newLimit.color} onChange={(e) => setNewLimit({ ...newLimit, color: e.target.value })} />
      </div>
      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 16 }} onClick={handleCreate} disabled={loading}>
        创建限位
      </button>

      <h4 style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>已有虚拟限位</h4>
      {virtualLimits.length === 0 ? (
        <p style={{ fontSize: 12, color: '#64748b' }}>暂无虚拟限位</p>
      ) : (
        virtualLimits.map((limit) => (
          <div key={limit.id} style={{
            padding: '8px 12px',
            background: '#1e293b',
            borderRadius: 4,
            marginBottom: 8,
            fontSize: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#e2e8f0', fontWeight: 500 }}>{limit.device_id}</div>
                <div style={{ color: '#64748b' }}>
                  X:[{limit.bounds.x_min.toFixed(1)}, {limit.bounds.x_max.toFixed(1)}]
                </div>
              </div>
              <button className="btn btn-danger btn-small" onClick={() => handleDelete(limit.id)}>
                删除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CalibrationTab() {
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId);
  const isCalibrating = useDeviceStore((s) => s.isCalibrating);
  const setIsCalibrating = useDeviceStore((s) => s.setIsCalibrating);
  const calibrationPoints = useDeviceStore((s) => s.calibrationPoints);
  const clearCalibrationPoints = useDeviceStore((s) => s.clearCalibrationPoints);
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStartCalibration = () => {
    setIsCalibrating(true);
    clearCalibrationPoints();
    setReport(null);
  };

  const handleFinishCalibration = async () => {
    if (!selectedDeviceId) {
      alert('请选择设备');
      return;
    }
    if (calibrationPoints.measured.length < 3) {
      alert('至少需要3个标定点');
      return;
    }
    setLoading(true);
    try {
      const res = await calibrationApi.calibrate(selectedDeviceId, calibrationPoints.measured, calibrationPoints.design);
      setReport(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || '标定失败');
    } finally {
      setLoading(false);
      setIsCalibrating(false);
    }
  };

  return (
    <div className="panel-body">
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isCalibrating ? (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleStartCalibration}>
              开始标定
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsCalibrating(false)}>
                取消
              </button>
              <button className="btn btn-success" style={{ flex: 1 }} onClick={handleFinishCalibration} disabled={loading}>
                完成标定
              </button>
            </>
          )}
        </div>
      </div>

      {isCalibrating && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(56, 189, 248, 0.2)',
          border: '1px solid #38bdf8',
          borderRadius: 4,
          fontSize: 12,
          color: '#38bdf8',
          marginBottom: 12
        }}>
          标定模式：在3D场景中点击设备上的关键点
        </div>
      )}

      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
        已采集标定点: {calibrationPoints.measured.length} / 6
      </div>

      {report && (
        <div style={{
          padding: 12,
          background: '#1e293b',
          borderRadius: 4,
          marginTop: 12
        }}>
          <h4 style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 8 }}>标定报告</h4>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
            <div>状态: <span style={{ color: report.status === 'passed' ? '#10b981' : report.status === 'warning' ? '#f59e0b' : '#ef4444' }}>{report.status}</span></div>
            <div>平均偏移: X={report.average_offset.x.toFixed(4)}, Y={report.average_offset.y.toFixed(4)}, Z={report.average_offset.z.toFixed(4)}</div>
            <div>最大偏移: {report.max_offset.toFixed(4)}</div>
            <div>RMSE: {report.rmse.toFixed(4)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshLogs = async () => {
    setLoading(true);
    try {
      const res = await logApi.list({ limit: 50 });
      setLogs(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    refreshLogs();
    const interval = setInterval(refreshLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="panel-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ fontSize: 12, color: '#94a3b8' }}>操作日志</h4>
        <button className="btn btn-secondary btn-small" onClick={refreshLogs}>刷新</button>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>加载中...</p>
      ) : logs.length === 0 ? (
        <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>暂无日志</p>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="log-entry">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="log-action">{log.action}</span>
              <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{log.username} - {log.resource}</div>
            {log.detail && <div className="log-detail">{log.detail}</div>}
          </div>
        ))
      )}
    </div>
  );
}
