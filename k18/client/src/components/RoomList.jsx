import React, { useState, useEffect } from 'react';
import { roomApi } from '../services/api';
import { Video, Users, Clock, Plus } from 'lucide-react';
import useRoomStore from '../store/roomStore';

export default function RoomList({ onCreateRoom, onJoinRoom }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');

  const loadRooms = async () => {
    try {
      const data = await roomApi.getAll();
      setRooms(data.rooms || []);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = (roomId) => {
    onJoinRoom(roomId);
  };

  const handleCreate = () => {
    if (newRoomId.trim()) {
      onJoinRoom(newRoomId.trim());
    } else {
      onCreateRoom();
    }
    setShowCreate(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">会诊室列表</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={18} />
          创建/加入会诊
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 bg-gray-800 rounded-lg">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="输入会诊室ID加入，留空创建新会诊"
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCreate}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
            >
              确认
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="text-center py-16">
          <Video size={64} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">暂无活跃会诊</p>
          <p className="text-gray-500 text-sm mt-2">点击上方按钮创建新会诊</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-semibold truncate">
                  {room.deviceName || '会诊室'}
                </span>
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  进行中
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <Users size={14} />
                  <span>{room.expertCount} / {room.maxExperts} 专家</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} />
                  <span>
                    {room.startedAt
                      ? `已进行 ${Math.floor((Date.now() - room.startedAt) / 60000)} 分钟`
                      : '等待设备接入'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleJoin(room.id)}
                  disabled={room.expertCount >= room.maxExperts}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                >
                  加入会诊
                </button>
              </div>

              <div className="mt-2 text-xs text-gray-500 font-mono truncate">
                ID: {room.id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
