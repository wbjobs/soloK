import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useRoom } from '../hooks/useRoom';
import VideoPlayer from '../components/VideoPlayer';
import Toolbar from '../components/Toolbar';
import ExpertPanel from '../components/ExpertPanel';
import RoomList from '../components/RoomList';
import VolumeRenderer from '../components/VolumeRenderer';
import { keyframeApi } from '../services/api';
import { aiDetectionService } from '../services/aiDetection';
import socketService from '../services/socket';
import useRoomStore from '../store/roomStore';
import useAIStore from '../store/aiStore';
import useVolumeStore from '../store/volumeStore';
import { generateMockUltrasoundVolume } from '../utils/mockVolume';
import {
  LogOut,
  Copy,
  Users,
  Wifi,
  RefreshCw,
  Camera,
  MessageSquare,
  X,
  Sparkles,
  Box,
} from 'lucide-react';

export default function ExpertPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [keyframeData, setKeyframeData] = useState(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [reportData, setReportData] = useState({ findings: '', impression: '', recommendations: '' });

  const isAIEnabled = useAIStore((s) => s.isEnabled);
  const setAIEnabled = useAIStore((s) => s.setEnabled);
  const isAIReady = useAIStore((s) => s.isReady);
  const isAILoading = useAIStore((s) => s.isLoading);
  const setAILoading = useAIStore((s) => s.setLoading);
  const setAIReady = useAIStore((s) => s.setReady);
  const setDetections = useAIStore((s) => s.setDetections);
  const clearDetections = useAIStore((s) => s.clearDetections);
  const setLastDetectionTime = useAIStore((s) => s.setLastDetectionTime);
  const confidenceThreshold = useAIStore((s) => s.confidenceThreshold);

  const is3DMode = useVolumeStore((s) => s.is3DMode);
  const set3DMode = useVolumeStore((s) => s.set3DMode);
  const volumeData = useVolumeStore((s) => s.volumeData);
  const setVolumeData = useVolumeStore((s) => s.setVolumeData);
  const isVolumeLoading = useVolumeStore((s) => s.isLoading);
  const setVolumeLoading = useVolumeStore((s) => s.setLoading);
  const clearVolume = useVolumeStore((s) => s.clearVolume);

  const aiDetectionRef = useRef(null);

  const { connect, disconnect, on, send, isConnected } = useSocket();
  const { createPeerConnection, createOffer, handleAnswer, addIceCandidate, adjustBitrate, close } = useWebRTC();
  const {
    roomId,
    experts,
    device,
    isFrozen,
    isRecording,
    annotations,
    remoteStreams,
    user,
    networkQuality,
    reconnectionState,
    setRoomId,
    setRoom,
    setExperts,
    setDevice,
    setFrozen,
    setRecording,
    setAnnotations,
    setMeasurements,
    addAnnotation,
    addMyAnnotation,
    removeAnnotation,
    removeMeasurement,
    resetRoom,
  } = useRoom();

  const handleJoinRoom = useCallback(async (rid) => {
    const socketId = socketService.id || 'expert-' + Date.now();
    send('expert:join', {
      roomId: rid,
      expertName: user?.username || '专家',
      expertId: socketId,
    });
    setRoomId(rid);
  }, [send, user?.username, setRoomId]);

  const handleCreateRoom = useCallback(() => {
    const newRoomId = 'room-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    handleJoinRoom(newRoomId);
  }, [handleJoinRoom]);

  const handleSaveKeyframe = useCallback(() => {
    const video = document.querySelector('video');
    if (!video || !video.videoWidth) {
      alert('视频流未就绪');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const frameData = canvas.toDataURL('image/png');

    setKeyframeData(frameData);
    setShowReportModal(true);
  }, []);

  const handleConfirmSave = useCallback(async () => {
    try {
      await keyframeApi.save(roomId, keyframeData, diagnosis, reportData);
      setShowReportModal(false);
      setKeyframeData(null);
      setDiagnosis('');
      setReportData({ findings: '', impression: '', recommendations: '' });
    } catch (err) {
      console.error('Failed to save keyframe:', err);
      alert('保存关键帧失败');
    }
  }, [roomId, keyframeData, diagnosis, reportData]);

  const handleClearAnnotations = useCallback(() => {
    annotations.forEach((ann) => {
      if (ann.expertId === socketService.id) {
        removeAnnotation(ann.id);
        send('annotation:remove', {
          roomId: store.roomId,
          annotationId: ann.id,
        });
      }
    });
  }, [annotations, removeAnnotation, send, store.roomId]);

  const handleDeleteAnnotation = useCallback((annotationId) => {
    removeAnnotation(annotationId);
    send('annotation:remove', {
      roomId: store.roomId,
      annotationId,
    });
  }, [removeAnnotation, send, store.roomId]);

  const handleToggleAI = useCallback(async () => {
    const newEnabled = !isAIEnabled;
    setAIEnabled(newEnabled);

    if (newEnabled) {
      setAILoading(true);
      try {
        await aiDetectionService.initialize();
        setAIReady(true, aiDetectionService.isMockMode);
        setAILoading(false);

        const startDetection = () => {
          if (!aiDetectionRef.current) return;

          const video = aiDetectionRef.current;
          if (video && video.videoWidth > 0) {
            aiDetectionService.detect(video, confidenceThreshold).then((detections) => {
              setDetections(detections);
              setLastDetectionTime(Date.now());
            });
          }

          if (useAIStore.getState().isEnabled) {
            setTimeout(startDetection, 500);
          }
        };

        setTimeout(startDetection, 100);
      } catch (err) {
        console.error('Failed to initialize AI detection:', err);
        setAILoading(false);
        setAIEnabled(false);
        alert('AI检测初始化失败');
      }
    } else {
      clearDetections();
    }
  }, [isAIEnabled, setAIEnabled, setAILoading, setAIReady, setDetections, clearDetections, setLastDetectionTime, confidenceThreshold]);

  const handleToggle3D = useCallback(async () => {
    const newMode = !is3DMode;
    set3DMode(newMode);

    if (newMode && !volumeData) {
      setVolumeLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const mockVolume = generateMockUltrasoundVolume(256, 256, 128);
        setVolumeData(mockVolume);
        setVolumeLoading(false);
      } catch (err) {
        console.error('Failed to load volume data:', err);
        setVolumeLoading(false);
        set3DMode(false);
        alert('3D容积数据加载失败');
      }
    }
  }, [is3DMode, set3DMode, volumeData, setVolumeData, setVolumeLoading]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    aiDetectionService.dispose();
    clearDetections();
    clearVolume();
    close();
    disconnect();
    resetRoom();
    navigate('/login');
  }, [close, disconnect, resetRoom, navigate, clearDetections, clearVolume]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    connect(token).then(() => {
      on('room:state', (state) => {
        setRoom(state);
        setExperts(state.experts || []);
        setDevice(state.deviceId ? { id: state.deviceId, name: state.deviceName } : null);
        setFrozen(state.frozen || false);
        setRecording(state.isRecording || false);
        setAnnotations(state.annotations || []);
        setMeasurements(state.measurements || []);

        if (state.deviceId) {
          createPeerConnection(true);
          setTimeout(() => {
            createOffer(state.deviceId);
          }, 500);
        }
      });

      on('device:ready', async ({ deviceId }) => {
        setDevice({ id: deviceId });
        createPeerConnection(true);
        setTimeout(() => {
          createOffer(deviceId);
        }, 500);
      });

      on('device:disconnected', () => {
        setDevice(null);
      });

      on('expert:joined', ({ id, name }) => {
        setExperts([...experts, { id, name }]);
      });

      on('expert:left', ({ id }) => {
        setExperts(experts.filter((e) => e.id !== id));
      });

      on('webrtc:answer', async ({ answer }) => {
        await handleAnswer(answer);
      });

      on('webrtc:ice-candidate', async ({ candidate }) => {
        await addIceCandidate(candidate);
      });

      on('stream:frozen', () => {
        setFrozen(true);
      });

      on('stream:unfrozen', () => {
        setFrozen(false);
      });

      on('recording:started', () => {
        setRecording(true);
      });

      on('recording:stopped', () => {
        setRecording(false);
      });

      on('annotation:added', (ann) => {
        addAnnotation(ann);
      });

      on('annotation:removed', ({ annotationId }) => {
        removeAnnotation(annotationId);
      });

      on('bitrate:adjusted', ({ bitrate }) => {
        adjustBitrate(bitrate);
      });
    });

    return () => {
      close();
      disconnect();
    };
  }, []);

  const remoteStream = remoteStreams.get('remote');

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-semibold">专家会诊端</h1>
              <p className="text-gray-400 text-sm">{user?.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {roomId && (
              <div className="flex items-center gap-2 bg-gray-700 px-3 py-1.5 rounded">
                <span className="text-gray-300 text-sm font-mono">{roomId}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(roomId)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Copy size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 text-gray-400">
              <Wifi size={16} className={networkQuality === 'poor' ? 'text-red-400' : networkQuality === 'excellent' ? 'text-green-400' : 'text-yellow-400'} />
              <span className="text-sm">
                {reconnectionState === 'reconnecting' ? '重连中...' :
                 reconnectionState === 'disconnected' ? '已断开' : '已连接'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-gray-400">
              <Users size={16} />
              <span className="text-sm">{experts.length} 专家</span>
            </div>

            {isRecording && (
              <div className="flex items-center gap-2 text-red-400">
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                <span className="text-sm">录制中</span>
              </div>
            )}

            <button
              onClick={handleToggleAI}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                isAIEnabled
                  ? isAILoading
                    ? 'bg-yellow-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={isAIEnabled ? '关闭AI检测' : '开启AI检测'}
            >
              <Sparkles size={16} className={isAILoading ? 'animate-spin' : ''} />
              <span className="text-sm">AI检测</span>
            </button>

            <button
              onClick={handleToggle3D}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                is3DMode
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={is3DMode ? '返回2D视图' : '3D容积视图'}
            >
              <Box size={16} className={isVolumeLoading ? 'animate-spin' : ''} />
              <span className="text-sm">3D视图</span>
            </button>

            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {!roomId ? (
        <RoomList
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      ) : (
        <>
          <Toolbar
            onFreeze={() => send('stream:freeze', { roomId })}
            onUnfreeze={() => send('stream:unfreeze', { roomId })}
            onSaveKeyframe={handleSaveKeyframe}
            onStartRecording={() => send('recording:start', { roomId })}
            onStopRecording={() => send('recording:stop', { roomId })}
            onClearAnnotations={handleClearAnnotations}
          />

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 p-4">
              {is3DMode ? (
                <div className="w-full h-full bg-gray-800 rounded-lg overflow-hidden">
                  <VolumeRenderer
                    volumeData={volumeData}
                    onAnnotationAdd={(ann) => send('annotation:3d:add', { roomId, annotation: ann })}
                    onAnnotationRemove={(id) => send('annotation:3d:remove', { roomId, annotationId: id })}
                  />
                </div>
              ) : remoteStream ? (
                <VideoPlayer
                  ref={aiDetectionRef}
                  stream={remoteStream}
                  showOverlay={true}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  aiEnabled={isAIEnabled}
                />
              ) : (
                <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    {device ? (
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw size={32} className="text-blue-400 animate-spin" />
                        <p className="text-gray-400">正在连接设备...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Camera size={48} className="text-gray-600" />
                        <p className="text-gray-400">等待设备接入</p>
                        <p className="text-gray-500 text-sm">请将会诊室ID告知设备端</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <ExpertPanel />
          </div>
        </>
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-semibold">保存关键帧 & 诊断报告</h2>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {keyframeData && (
                <div>
                  <label className="block text-gray-300 text-sm mb-2">图像预览</label>
                  <img
                    src={keyframeData}
                    alt="关键帧"
                    className="w-full rounded-lg max-h-64 object-contain bg-gray-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-300 text-sm mb-2">诊断意见</label>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  placeholder="输入诊断意见..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-gray-300 text-sm mb-2">检查所见</label>
                  <textarea
                    value={reportData.findings}
                    onChange={(e) => setReportData({ ...reportData, findings: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    placeholder="描述检查所见..."
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm mb-2">印象</label>
                  <textarea
                    value={reportData.impression}
                    onChange={(e) => setReportData({ ...reportData, impression: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    placeholder="超声所见印象..."
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm mb-2">建议</label>
                  <textarea
                    value={reportData.recommendations}
                    onChange={(e) => setReportData({ ...reportData, recommendations: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    placeholder="处理建议..."
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSave}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                保存到PACS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
