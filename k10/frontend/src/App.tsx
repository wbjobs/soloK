import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Scene3D from './components/Scene3D';
import ControlPanel from './components/ControlPanel';
import { useDeviceStore } from './store/deviceStore';
import { wsService } from './services/websocket';
import { deviceApi, anomalyApi, limitApi, logApi } from './services/api';
import type { User, Device, AnomalyEvent, VirtualLimit } from './types';

export default function App() {
  const currentUser = useDeviceStore((s) => s.currentUser);
  const setCurrentUser = useDeviceStore((s) => s.setCurrentUser);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const setAnomalies = useDeviceStore((s) => s.setAnomalies);
  const setVirtualLimits = useDeviceStore((s) => s.setVirtualLimits);
  const addAnomaly = useDeviceStore((s) => s.addAnomaly);
  const setTelemetry = useDeviceStore((s) => s.setTelemetry);
  const setRoboticArmState = useDeviceStore((s) => s.setRoboticArmState);
  const setConveyorState = useDeviceStore((s) => s.setConveyorState);
  const setVisionState = useDeviceStore((s) => s.setVisionState);

  const [activeTab, setActiveTab] = useState<'control' | 'limits' | 'calibration' | 'logs'>('control');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        setCurrentUser(user);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, [setCurrentUser]);

  useEffect(() => {
    if (!currentUser || initialized) return;

    const init = async () => {
      try {
        const [devicesRes, anomaliesRes, limitsRes] = await Promise.all([
          deviceApi.list(),
          anomalyApi.list(),
          limitApi.list()
        ]);

        setDevices(devicesRes.data);
        setAnomalies(anomaliesRes.data);
        setVirtualLimits(limitsRes.data);
      } catch (err) {
        console.error('Failed to initialize:', err);
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      wsService.connect(wsUrl).catch((err) => {
        console.error('WebSocket connection failed:', err);
      });

      wsService.on('telemetry', (data) => {
        if (data.device_id) {
          setTelemetry(data.device_id, data);
        }
      });

      wsService.on('anomaly', (data) => {
        addAnomaly({
          id: `anomaly_${Date.now()}`,
          device_id: data.device_id,
          type: data.type || 'unknown',
          severity: data.score > 0.8 ? 'critical' : 'warning',
          description: `异常检测: ${data.type}`,
          score: data.score || 0,
          position: data.position,
          timestamp: data.timestamp || new Date().toISOString(),
          acknowledged: false
        });
      });

      setInitialized(true);
    };

    init();
  }, [currentUser, initialized, setDevices, setAnomalies, setVirtualLimits, addAnomaly, setTelemetry]);

  if (!currentUser) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>数字孪生调试台</h1>
          <p>Industrial Digital Twin</p>
        </div>
        <DeviceList />
        <div className="sidebar-section">
          <h3>系统状态</h3>
          <div className="status-indicator">
            <span className="status-dot connected" />
            <span>MQTT 已连接</span>
          </div>
          <div className="status-indicator" style={{ marginTop: 8 }}>
            <span className="status-dot connected" />
            <span>WebSocket 已连接</span>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="topbar">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>3D 场景视图</h2>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-secondary btn-small" onClick={() => setActiveTab('logs')}>
              操作日志
            </button>
            <div className="user-info">
              <span>{currentUser.username}</span>
              <span className={`user-role ${currentUser.role}`}>
                {currentUser.role}
              </span>
            </div>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                setCurrentUser(null);
              }}
            >
              退出
            </button>
          </div>
        </div>

        <div className="viewport">
          <Scene3D />
          <div className="control-panel">
            <div className="tab-container">
              <div
                className={`tab ${activeTab === 'control' ? 'active' : ''}`}
                onClick={() => setActiveTab('control')}
              >
                设备控制
              </div>
              <div
                className={`tab ${activeTab === 'limits' ? 'active' : ''}`}
                onClick={() => setActiveTab('limits')}
              >
                虚拟限位
              </div>
              <div
                className={`tab ${activeTab === 'calibration' ? 'active' : ''}`}
                onClick={() => setActiveTab('calibration')}
              >
                标定
              </div>
              <div
                className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
                onClick={() => setActiveTab('logs')}
              >
                日志
              </div>
            </div>
            <ControlPanel activeTab={activeTab} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceList() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId);
  const setSelectedDevice = useDeviceStore((s) => s.setSelectedDevice);
  const telemetry = useDeviceStore((s) => s.telemetry);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'robotic_arm': return '🦾';
      case 'conveyor_belt': return '🔄';
      case 'vision_inspector': return '📷';
      default: return '⚙️';
    }
  };

  const getDeviceTypeLabel = (type: string) => {
    switch (type) {
      case 'robotic_arm': return 'robotic-arm';
      case 'conveyor_belt': return 'conveyor';
      case 'vision_inspector': return 'vision';
      default: return '';
    }
  };

  if (devices.length === 0) {
    return (
      <div className="sidebar-section">
        <h3>设备列表</h3>
        <p style={{ fontSize: 12, color: '#64748b' }}>暂无设备</p>
      </div>
    );
  }

  return (
    <div className="sidebar-section">
      <h3>设备列表</h3>
      {devices.map((device) => {
        const tel = telemetry.get(device.id);
        return (
          <div
            key={device.id}
            className={`device-item ${selectedDeviceId === device.id ? 'selected' : ''}`}
            onClick={() => setSelectedDevice(device.id)}
          >
            <div className={`device-icon ${getDeviceTypeLabel(device.type)}`}>
              {getDeviceIcon(device.type)}
            </div>
            <div className="device-info">
              <div className="device-name">{device.name}</div>
              <div className={`device-status ${device.status}`}>
                {device.status === 'online' && '● 在线'}
                {device.status === 'offline' && '● 离线'}
                {device.status === 'fault' && '● 故障'}
              </div>
              {tel && (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  {tel.temperature.toFixed(1)}°C | {tel.vibration.toFixed(2)}mm/s
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
