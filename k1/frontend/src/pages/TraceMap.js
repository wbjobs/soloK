import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { trackingAPI } from '../services/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createCustomIcon = (color, size = 20) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width: ${size}px; height: ${size}px; background-color: ${color}; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const createTruckIcon = () => {
  return L.divIcon({
    className: 'truck-marker',
    html: `<div style="font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); transform: translate(-50%, -50%);">🚚</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

const greenIcon = createCustomIcon('#2e7d32');
const redIcon = createCustomIcon('#d32f2f');
const blueIcon = createCustomIcon('#1976d2');
const truckIcon = createTruckIcon();

const formatDuration = (ms) => {
  if (!ms) return '待计算';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}小时${minutes}分钟`;
};

const formatDurationShort = (ms) => {
  if (!ms) return '0分钟';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  return `${minutes}m`;
};

const getNodeTypeName = (type) => {
  const names = {
    transfer_center: '转运中心',
    distribution_center: '分拨中心',
    delivery_station: '派送站点'
  };
  return names[type] || type;
};

const DEFAULT_CENTER = [35.8617, 104.1954];

const playSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'arrival') {
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } else if (type === 'complete') {
      oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.15);
      oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }
  } catch (e) {
    console.log('Audio not supported');
  }
};

function TraceMap() {
  const { trackingNumber } = useParams();
  const [searchInput, setSearchInput] = useState(trackingNumber || '');
  const [traceData, setTraceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mapRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [currentStep, setCurrentStep] = useState(-1);
  const [animatedPosition, setAnimatedPosition] = useState(null);
  const [showPrediction, setShowPrediction] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const animationRef = useRef(null);
  const animationStartTime = useRef(null);
  const currentSegmentRef = useRef(null);

  const fetchTrace = useCallback(async (tn) => {
    if (!tn) return;
    
    setLoading(true);
    setError('');
    setIsPlaying(false);
    setCurrentStep(-1);
    setAnimatedPosition(null);
    
    try {
      const response = await trackingAPI.getTrace(tn);
      setTraceData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || '获取轨迹数据失败');
      setTraceData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (trackingNumber) {
      fetchTrace(trackingNumber);
    }
  }, [trackingNumber, fetchTrace]);

  const handleSearch = useCallback((e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      fetchTrace(searchInput.trim());
    }
  }, [searchInput, fetchTrace]);

  const centerPosition = useMemo(() => {
    if (traceData?.trace_path?.length > 0) {
      const nodes = traceData.trace_path;
      const avgLat = nodes.reduce((sum, n) => sum + n.latitude, 0) / nodes.length;
      const avgLng = nodes.reduce((sum, n) => sum + n.longitude, 0) / nodes.length;
      return [avgLat, avgLng];
    }
    return DEFAULT_CENTER;
  }, [traceData]);

  const polylineCoords = useMemo(() => {
    if (!traceData?.trace_path) return [];
    return traceData.trace_path.map(node => [node.latitude, node.longitude]);
  }, [traceData]);

  const animatedPolylineCoords = useMemo(() => {
    if (!traceData?.trace_path || currentStep < 0) return [];
    
    const coords = [];
    for (let i = 0; i <= currentStep; i++) {
      coords.push([traceData.trace_path[i].latitude, traceData.trace_path[i].longitude]);
    }
    if (animatedPosition) {
      coords.push([animatedPosition.latitude, animatedPosition.longitude]);
    }
    return coords;
  }, [traceData, currentStep, animatedPosition]);

  const getSegmentDuration = useCallback((fromNode, toNode) => {
    if (!fromNode.departed_at || !toNode.arrived_at) {
      return 3000;
    }
    const duration = new Date(toNode.arrived_at).getTime() - new Date(fromNode.departed_at).getTime();
    return Math.max(duration, 1000);
  }, []);

  const animate = useCallback((timestamp) => {
    if (!animationStartTime.current) {
      animationStartTime.current = timestamp;
    }

    const segment = currentSegmentRef.current;
    if (!segment) {
      setIsPlaying(false);
      return;
    }

    const { fromNode, toNode, realDuration } = segment;
    const animationDuration = Math.max(realDuration / (1000 * playSpeed), 2000);
    const elapsed = timestamp - animationStartTime.current;
    const progress = Math.min(elapsed / animationDuration, 1);

    const lat = fromNode.latitude + (toNode.latitude - fromNode.latitude) * progress;
    const lng = fromNode.longitude + (toNode.longitude - fromNode.longitude) * progress;
    
    setAnimatedPosition({ latitude: lat, longitude: lng });

    if (progress >= 1) {
      if (soundEnabled) {
        playSound('arrival');
      }
      
      setCurrentStep(prev => {
        const nextStep = prev + 1;
        const nodes = traceData.trace_path;
        
        if (nextStep >= nodes.length - 1) {
          if (soundEnabled) {
            setTimeout(() => playSound('complete'), 300);
          }
          setIsPlaying(false);
          setAnimatedPosition(null);
          return nodes.length - 1;
        }
        
        currentSegmentRef.current = {
          fromNode: nodes[nextStep],
          toNode: nodes[nextStep + 1],
          realDuration: getSegmentDuration(nodes[nextStep], nodes[nextStep + 1])
        };
        animationStartTime.current = null;
        
        return nextStep;
      });
    }

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, playSpeed, soundEnabled, traceData, getSegmentDuration]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, animate]);

  const handlePlay = useCallback(() => {
    if (!traceData?.trace_path || traceData.trace_path.length < 2) {
      return;
    }

    if (currentStep >= traceData.trace_path.length - 1) {
      setCurrentStep(0);
      setAnimatedPosition(null);
    }

    const startIdx = currentStep < 0 ? 0 : currentStep;
    if (startIdx >= traceData.trace_path.length - 1) {
      return;
    }

    currentSegmentRef.current = {
      fromNode: traceData.trace_path[startIdx],
      toNode: traceData.trace_path[startIdx + 1],
      realDuration: getSegmentDuration(
        traceData.trace_path[startIdx],
        traceData.trace_path[startIdx + 1]
      )
    };
    
    animationStartTime.current = null;
    if (currentStep < 0) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  }, [traceData, currentStep, getSegmentDuration]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(-1);
    setAnimatedPosition(null);
    animationStartTime.current = null;
    currentSegmentRef.current = null;
  }, []);

  const handleSpeedChange = useCallback((speed) => {
    setPlaySpeed(speed);
    animationStartTime.current = null;
  }, []);

  const displayNodes = useMemo(() => {
    if (!traceData?.trace_path) return [];
    if (currentStep < 0 || !isPlaying) {
      return traceData.trace_path;
    }
    return traceData.trace_path.slice(0, currentStep + 1);
  }, [traceData, currentStep, isPlaying]);

  const predictionLineCoords = useMemo(() => {
    if (!traceData?.prediction || !showPrediction || traceData.trace_path.length === 0) {
      return [];
    }
    const lastNode = traceData.trace_path[traceData.trace_path.length - 1];
    const nextNode = traceData.prediction.next_node;
    return [
      [lastNode.latitude, lastNode.longitude],
      [nextNode.latitude, nextNode.longitude]
    ];
  }, [traceData, showPrediction]);

  return (
    <div>
      <div className="card">
        <h2>包裹路径追溯</h2>
        
        <form onSubmit={handleSearch} className="search-bar">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="请输入运单号进行查询"
            style={{ fontSize: '1rem' }}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '查询中...' : '查询'}
          </button>
        </form>

        {error && <div className="alert alert-error">{error}</div>}
      </div>

      {traceData && (
        <>
          {traceData.prediction && showPrediction && (
            <div className="card" style={{ borderLeft: '4px solid #9c27b0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '20px' }}>
                <div>
                  <h3 style={{ color: '#9c27b0' }}>🔮 路径预测</h3>
                  <p style={{ marginTop: '12px' }}>
                    <strong>下一节点：</strong>
                    {traceData.prediction.next_node.node_name}
                    <span className="badge badge-info" style={{ marginLeft: '8px' }}>
                      {getNodeTypeName(traceData.prediction.next_node.node_type)}
                    </span>
                  </p>
                  <p>
                    <strong>预计到达：</strong>
                    <span style={{ color: '#9c27b0', fontWeight: '600' }}>
                      {new Date(traceData.prediction.estimated_arrival).toLocaleString('zh-CN')}
                    </span>
                  </p>
                  {traceData.prediction.estimated_transport_duration_ms && (
                    <p>
                      <strong>预计运输时长：</strong>
                      {formatDuration(traceData.prediction.estimated_transport_duration_ms)}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.875rem', color: '#666' }}>
                    置信度：<strong>{traceData.prediction.confidence}%</strong>
                  </p>
                  <p style={{ fontSize: '0.875rem', color: '#666' }}>
                    历史样本：{traceData.prediction.historical_sample_count} 条
                  </p>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setShowPrediction(false)}
                    style={{ marginTop: '8px' }}
                  >
                    隐藏预测
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <h3>包裹信息</h3>
                <p style={{ marginTop: '12px' }}>
                  <strong>运单号：</strong>
                  <span style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{traceData.tracking_number}</span>
                </p>
                <p>
                  <strong>运输方式：</strong>
                  {traceData.shipping_method === 'air' ? '✈️ 航空' : '🚛 陆运'}
                </p>
                <p>
                  <strong>当前状态：</strong>
                  <span className={`badge ${traceData.status === 'delivered' ? 'badge-success' : traceData.status === 'in_transit' ? 'badge-warning' : 'badge-info'}`}>
                    {traceData.status === 'delivered' ? '已送达' : traceData.status === 'in_transit' ? '运输中' : '已创建'}
                  </span>
                </p>
              </div>
              <div>
                <p><strong>寄件人：</strong>{traceData.sender.name}</p>
                <p><strong>寄件地址：</strong>{traceData.sender.address}</p>
                <p><strong>收件人：</strong>{traceData.receiver.name}</p>
                <p><strong>收件地址：</strong>{traceData.receiver.address}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <h3>运输路径地图</h3>
              
              {traceData.trace_path.length >= 2 && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '4px', background: '#f5f5f5', padding: '4px', borderRadius: '6px' }}>
                    {[0.5, 1, 2].map(speed => (
                      <button
                        key={speed}
                        className={`btn btn-sm ${playSpeed === speed ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => handleSpeedChange(speed)}
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                  
                  <button
                    className={`btn btn-sm ${soundEnabled ? 'btn-success' : 'btn-secondary'}`}
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    title={soundEnabled ? '关闭音效' : '开启音效'}
                  >
                    {soundEnabled ? '🔊' : '🔇'}
                  </button>
                  
                  {!isPlaying ? (
                    <button
                      className="btn btn-sm btn-success"
                      onClick={handlePlay}
                      disabled={traceData.trace_path.length < 2}
                    >
                      ▶️ 播放
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-warning"
                      onClick={handlePause}
                    >
                      ⏸️ 暂停
                    </button>
                  )}
                  
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={handleReset}
                  >
                    🔄 重置
                  </button>
                </div>
              )}
            </div>

            {isPlaying && (
              <div style={{ background: 'linear-gradient(90deg, #e3f2fd, #bbdefb)', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                  <div>
                    <strong>播放中：</strong>
                    {currentStep >= 0 && traceData.trace_path[currentStep] && (
                      <span>
                        已到达 <strong>{traceData.trace_path[currentStep].node_name}</strong>
                        {currentStep < traceData.trace_path.length - 1 && (
                          <span> → {traceData.trace_path[currentStep + 1].node_name}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'monospace' }}>
                    进度：{Math.min(currentStep + 1, traceData.trace_path.length)} / {traceData.trace_path.length}
                  </div>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.5)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: '#1976d2',
                      borderRadius: '3px',
                      width: `${Math.min(((currentStep + 1) / traceData.trace_path.length) * 100, 100)}%`,
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
              </div>
            )}
            
            <div className="legend">
              <div className="legend-item">
                <div className="legend-marker green"></div>
                <span>正常节点</span>
              </div>
              <div className="legend-item">
                <div className="legend-marker red"></div>
                <span>超时预警</span>
              </div>
              <div className="legend-item">
                <div className="legend-marker blue"></div>
                <span>停留中</span>
              </div>
              <div className="legend-item">
                <div className="legend-marker" style={{ background: '#9c27b0' }}></div>
                <span>预测节点</span>
              </div>
              <div className="legend-item">
                <span style={{ fontSize: '1.2rem' }}>🚚</span>
                <span>当前位置</span>
              </div>
            </div>

            <div className="map-container">
              <MapContainer
                ref={mapRef}
                center={centerPosition}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
                zoomAnimation={false}
                fadeAnimation={false}
                markerZoomAnimation={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  updateWhenIdle={true}
                />
                
                {polylineCoords.length > 1 && !isPlaying && (
                  <Polyline
                    positions={polylineCoords}
                    color="#1976d2"
                    weight={4}
                    opacity={0.7}
                    dashArray="10, 10"
                    interactive={false}
                  />
                )}

                {animatedPolylineCoords.length > 1 && isPlaying && (
                  <Polyline
                    positions={animatedPolylineCoords}
                    color="#1976d2"
                    weight={5}
                    opacity={0.9}
                    interactive={false}
                  />
                )}

                {predictionLineCoords.length > 0 && (
                  <Polyline
                    positions={predictionLineCoords}
                    color="#9c27b0"
                    weight={3}
                    opacity={0.6}
                    dashArray="5, 10"
                    interactive={false}
                  />
                )}

                {traceData.prediction?.next_node && showPrediction && (
                  <CircleMarker
                    center={[traceData.prediction.next_node.latitude, traceData.prediction.next_node.longitude]}
                    radius={10}
                    pathOptions={{ color: '#9c27b0', fillColor: '#9c27b0', fillOpacity: 0.3, weight: 2, dashArray: '5, 5' }}
                  >
                    <Popup>
                      <div className="node-info">
                        <h4>🔮 预测: {traceData.prediction.next_node.node_name}</h4>
                        <p><strong>类型：</strong>{getNodeTypeName(traceData.prediction.next_node.node_type)}</p>
                        <p><strong>预计到达：</strong>{new Date(traceData.prediction.estimated_arrival).toLocaleString('zh-CN')}</p>
                        <p><strong>置信度：</strong>{traceData.prediction.confidence}%</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                )}

                {displayNodes.map((node, index) => {
                  const icon = node.is_timeout ? redIcon : 
                               !node.departed_at ? blueIcon : greenIcon;
                  
                  return (
                    <Marker
                      key={node.id}
                      position={[node.latitude, node.longitude]}
                      icon={icon}
                      eventHandlers={{
                        mouseover: (e) => {
                          e.target.openTooltip();
                        },
                        mouseout: (e) => {
                          e.target.closeTooltip();
                        }
                      }}
                      zIndexOffset={isPlaying && index === currentStep ? 1000 : 100}
                    >
                      <Tooltip
                        permanent={false}
                        direction="right"
                        offset={[15, 0]}
                        opacity={1}
                        interactive={false}
                        className="node-tooltip"
                      >
                        <div style={{ pointerEvents: 'none' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                            第{index + 1}站: {node.node_name}
                          </div>
                          <div>停留: {formatDurationShort(node.duration_ms)}</div>
                          {node.is_timeout && <div style={{ color: '#d32f2f', fontWeight: 'bold' }}>⚠️ 超时</div>}
                        </div>
                      </Tooltip>
                      <Popup>
                        <div className="node-info">
                          <h4>📍 {node.node_name}</h4>
                          <p><strong>站点：</strong>第 {index + 1} 站</p>
                          <p><strong>类型：</strong>{getNodeTypeName(node.node_type)}</p>
                          <p><strong>到达：</strong>{node.arrived_at ? new Date(node.arrived_at).toLocaleString('zh-CN') : '-'}</p>
                          <p><strong>离开：</strong>{node.departed_at ? new Date(node.departed_at).toLocaleString('zh-CN') : '停留中'}</p>
                          <p><strong>停留时长：</strong>{formatDuration(node.duration_ms)}</p>
                          <p><strong>扫描员：</strong>{node.scanner_name || '-'}</p>
                          {node.is_timeout && (
                            <p className="timeout">⚠️ 已超过标准时效！</p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {animatedPosition && (
                  <Marker
                    position={[animatedPosition.latitude, animatedPosition.longitude]}
                    icon={truckIcon}
                    zIndexOffset={2000}
                    interactive={false}
                  >
                    <Tooltip
                      permanent={true}
                      direction="top"
                      offset={[0, -20]}
                      opacity={1}
                      className="node-tooltip"
                    >
                      <div style={{ pointerEvents: 'none', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        🚚 运输中
                      </div>
                    </Tooltip>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>

          <div className="card">
            <h3>扫描节点详情 ({traceData.trace_path.length} 个节点)</h3>
            
            {traceData.trace_path.length === 0 ? (
              <p style={{ padding: '20px', color: '#999', textAlign: 'center' }}>暂无扫描记录</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>节点名称</th>
                    <th>类型</th>
                    <th>到达时间</th>
                    <th>离开时间</th>
                    <th>停留时长</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {traceData.trace_path.map((node, index) => (
                    <tr 
                      key={node.id} 
                      style={{
                        ...(node.is_timeout ? { backgroundColor: '#ffebee' } : {}),
                        ...(isPlaying && index === currentStep ? { backgroundColor: '#e3f2fd' } : {})
                      }}
                    >
                      <td>
                        {index + 1}
                        {isPlaying && index === currentStep && (
                          <span style={{ marginLeft: '8px' }}>📍</span>
                        )}
                      </td>
                      <td>{node.node_name}</td>
                      <td>{getNodeTypeName(node.node_type)}</td>
                      <td>{node.arrived_at ? new Date(node.arrived_at).toLocaleString('zh-CN') : '-'}</td>
                      <td>{node.departed_at ? new Date(node.departed_at).toLocaleString('zh-CN') : '停留中'}</td>
                      <td>{formatDuration(node.duration_ms)}</td>
                      <td>
                        {node.is_timeout ? (
                          <span className="badge badge-danger">超时预警</span>
                        ) : !node.departed_at ? (
                          <span className="badge badge-info">停留中</span>
                        ) : (
                          <span className="badge badge-success">正常</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!traceData && !loading && !error && (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🔍</div>
          <h3>输入运单号开始查询</h3>
          <p style={{ color: '#666', marginTop: '10px' }}>
            请在上方输入框中输入运单号，查看包裹的完整运输路径
          </p>
        </div>
      )}
    </div>
  );
}

export default TraceMap;
