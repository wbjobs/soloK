import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useRoom } from '../hooks/useRoom';
import VideoPlayer from '../components/VideoPlayer';
import { Video, VideoOff, Mic, MicOff, LogOut, Wifi, Users } from 'lucide-react';
import useRoomStore from '../store/roomStore';

export default function DevicePage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [roomCreated, setRoomCreated] = useState(false);

  const { connect, disconnect, on, send, isConnected } = useSocket();
  const { initializeLocalStream, createPeerConnection, handleOffer, addIceCandidate, close } = useWebRTC();
  const { registerDevice, leaveRoom } = useRoom();

  const user = useRoomStore((s) => s.user);
  const localStream = useRoomStore((s) => s.localStream);
  const experts = useRoomStore((s) => s.experts);
  const setExperts = useRoomStore((s) => s.setExperts);
  const setRoom = useRoomStore((s) => s.setRoom);
  const setRoomId = useRoomStore((s) => s.setRoomId);
  const setFrozen = useRoomStore((s) => s.setFrozen);
  const setRecording = useRoomStore((s) => s.setRecording);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const autoRoomId = 'device-' + Date.now();
    setRoomId(autoRoomId);

    connect(token).then(() => {
      on('expert:joined', ({ id, name }) => {
        setExperts([...experts, { id, name }]);
      });

      on('expert:left', ({ id }) => {
        setExperts(experts.filter((e) => e.id !== id));
      });

      on('webrtc:offer', async ({ from, offer }) => {
        await handleOffer(offer, from);
      });

      on('webrtc:ice-candidate', async ({ from, candidate }) => {
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
    });

    return () => {
      close();
      disconnect();
    };
  }, []);

  const handleStart = useCallback(async () => {
    try {
      await initializeLocalStream(videoRef.current);
      createPeerConnection(false);

      registerDevice(roomId, user?.username || '超声设备');
      setRoomId(roomId);
      setRoomCreated(true);

      navigator.clipboard.writeText(roomId);
    } catch (err) {
      console.error('Failed to start:', err);
      alert('无法访问摄像头，请检查权限设置');
    }
  }, [roomId, user?.username]);

  const handleStop = useCallback(() => {
    leaveRoom();
    close();
    disconnect();
    navigate('/login');
  }, [leaveRoom, close, disconnect, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    close();
    disconnect();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <Video size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-semibold">超声设备端</h1>
              <p className="text-gray-400 text-sm">{user?.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-gray-400">
              <Wifi size={16} className={isConnected ? 'text-green-400' : 'text-red-400'} />
              <span className="text-sm">{isConnected ? '已连接' : '未连接'}</span>
            </div>

            <div className="flex items-center gap-2 text-gray-400">
              <Users size={16} />
              <span className="text-sm">{experts.length} 专家</span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        {!roomCreated ? (
          <div className="max-w-lg mx-auto mt-16">
            <div className="bg-gray-800 rounded-xl p-8 text-center">
              <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
                <Video size={40} className="text-gray-500" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">启动设备推流</h2>
              <p className="text-gray-400 mb-6">
                会诊室ID将自动复制到剪贴板，分享给专家即可加入会诊
              </p>

              <div className="mb-6">
                <label className="block text-gray-300 text-sm mb-2">会诊室ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleStart}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                启动推流
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex-1 bg-black rounded-lg overflow-hidden mb-4 relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />

              <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded text-sm font-medium flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                推流中
              </div>

              <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded text-sm font-mono">
                {roomId}
              </div>

              <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-2 rounded text-sm">
                <p>在线专家: {experts.length}</p>
                {experts.map((e) => (
                  <p key={e.id} className="text-gray-300 text-xs">- {e.name}</p>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleStop}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                停止推流
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
