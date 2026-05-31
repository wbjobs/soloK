import { useState } from 'react';
import type { PlayerPosition, PlayerStats } from '../../types';

export interface PlayerInfoPanelProps {
  player: PlayerPosition | null;
  stats?: PlayerStats | null;
  onUpdate?: (id: string, updates: Partial<PlayerPosition>) => void;
  onClose?: () => void;
}

const PlayerInfoPanel = ({ player, stats, onUpdate, onClose }: PlayerInfoPanelProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState(0);
  const [editX, setEditX] = useState(0);
  const [editY, setEditY] = useState(0);

  const handleStartEdit = () => {
    if (!player) return;
    setEditName(player.name);
    setEditNumber(player.jerseyNumber);
    setEditX(Math.round(player.x));
    setEditY(Math.round(player.y));
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!player || !onUpdate) return;
    onUpdate(player.id, {
      name: editName,
      jerseyNumber: editNumber,
      x: editX,
      y: editY,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  if (!player) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-8">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-sm text-gray-400">点击球场上的球员查看详情</p>
        </div>
      </div>
    );
  }

  const teamBgClass = player.teamId === 'home' ? 'bg-blue-50' : 'bg-red-50';
  const teamTextClass = player.teamId === 'home' ? 'text-blue-600' : 'text-red-600';
  const teamBorderClass = player.teamId === 'home' ? 'border-blue-200' : 'border-red-200';
  const teamBadgeClass = player.teamId === 'home' ? 'bg-blue-600' : 'bg-red-600';

  return (
    <div className={`bg-white rounded-xl shadow-sm border ${teamBorderClass} overflow-hidden`}>
      <div className={`${teamBgClass} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 ${teamBadgeClass} rounded-full flex items-center justify-center text-white font-bold text-lg`}>
            {player.jerseyNumber}
          </div>
          <div>
            <h3 className={`font-bold ${teamTextClass}`}>{player.name}</h3>
            <p className="text-xs text-gray-500">
              {player.teamId === 'home' ? '主队' : '客队'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={isEditing ? handleSave : handleStartEdit}
            className={`p-1.5 rounded-lg transition-colors ${
              isEditing ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'text-gray-400 hover:bg-white hover:text-gray-600'
            }`}
            title={isEditing ? '保存' : '编辑'}
          >
            {isEditing ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            )}
          </button>
          {isEditing && (
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition-colors"
              title="取消"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition-colors"
              title="关闭"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">球员姓名</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">球衣号码</label>
              <input
                type="number"
                value={editNumber}
                onChange={(e) => setEditNumber(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">X 坐标</label>
                <input
                  type="number"
                  value={editX}
                  onChange={(e) => setEditX(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Y 坐标</label>
                <input
                  type="number"
                  value={editY}
                  onChange={(e) => setEditY(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400">位置 X</p>
                <p className="text-lg font-bold text-gray-800">{Math.round(player.x)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400">位置 Y</p>
                <p className="text-lg font-bold text-gray-800">{Math.round(player.y)}</p>
              </div>
            </div>
          </div>
        )}

        {stats && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">统计摘要</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">跑动距离</p>
                <p className="text-sm font-bold text-gray-800">{(stats.totalDistance / 1000).toFixed(1)} km</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">高强度跑</p>
                <p className="text-sm font-bold text-gray-800">{Math.round(stats.highIntensityDistance)} m</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">冲刺次数</p>
                <p className="text-sm font-bold text-gray-800">{stats.sprintCount}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">最高速度</p>
                <p className="text-sm font-bold text-gray-800">{stats.maxSpeed.toFixed(1)} km/h</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">传球成功率</p>
                <p className="text-sm font-bold text-gray-800">
                  {stats.passes > 0 ? Math.round((stats.successfulPasses / stats.passes) * 100) : 0}%
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">射门/射正</p>
                <p className="text-sm font-bold text-gray-800">{stats.shots}/{stats.shotsOnTarget}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">抢断</p>
                <p className="text-sm font-bold text-gray-800">{stats.tackles}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">拦截</p>
                <p className="text-sm font-bold text-gray-800">{stats.interceptions}</p>
              </div>
            </div>
          </div>
        )}

        {!stats && (
          <div className="text-center py-2">
            <p className="text-xs text-gray-400">暂无统计数据</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerInfoPanel;
