import { useState } from 'react';
import { X, Users, Link2, Copy, Check, PlayCircle } from 'lucide-react';
import { networkManager } from '../game/network/NetworkManager';
import { useGameStore } from '../store/useGameStore';

interface NetworkPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NetworkPanel({ isOpen, onClose }: NetworkPanelProps) {
  const [mode, setMode] = useState<'menu' | 'host' | 'join'>('menu');
  const [hostId, setHostId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('玩家' + Math.floor(Math.random() * 1000));
  const [isConnected, setIsConnected] = useState(false);

  const { addNotification } = useGameStore();

  if (!isOpen) return null;

  const handleHost = async () => {
    setIsLoading(true);
    setError('');
    try {
      const id = await networkManager.hostGame();
      setHostId(id);
      setMode('host');
      addNotification('房间创建成功！分享ID给好友加入', 'success');
      setIsConnected(true);
    } catch (err) {
      setError('创建房间失败，请重试');
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleJoin = async () => {
    if (!joinId.trim()) {
      setError('请输入房间ID');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const success = await networkManager.joinGame(joinId.trim());
      if (success) {
        addNotification('成功加入游戏！', 'success');
        setMode('join');
        setIsConnected(true);
      }
    } catch (err) {
      setError('加入房间失败，请检查ID是否正确');
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(hostId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    networkManager.disconnect();
    setIsConnected(false);
    setMode('menu');
    setHostId('');
    setJoinId('');
    addNotification('已断开连接', 'info');
  };

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl p-6 max-w-md w-full border-2 border-purple-800 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-purple-300 flex items-center gap-2">
            <Users className="w-6 h-6" />
            联机合作
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {mode === 'menu' && (
          <div className="space-y-4">
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">你的名字</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="输入你的名字"
              />
            </div>

            <button
              onClick={handleHost}
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-5 h-5" />
              {isLoading ? '创建中...' : '创建房间'}
            </button>

            <div className="flex items-center gap-4 my-4">
              <div className="flex-1 h-px bg-gray-700" />
              <span className="text-gray-500 text-sm">或</span>
              <div className="flex-1 h-px bg-gray-700" />
            </div>

            <div>
              <input
                type="text"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 mb-3"
                placeholder="输入房间ID"
              />
              <button
                onClick={handleJoin}
                disabled={isLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2"
              >
                <Link2 className="w-5 h-5" />
                {isLoading ? '加入中...' : '加入游戏'}
              </button>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
          </div>
        )}

        {(mode === 'host' || mode === 'join') && isConnected && (
          <div className="space-y-4">
            <div className="p-4 bg-green-900/30 border border-green-700 rounded-lg text-center">
              <p className="text-green-400 font-bold flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                {mode === 'host' ? '房间已创建' : '已加入游戏'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {mode === 'host' ? '等待其他玩家加入...' : '已连接到主机'}
              </p>
            </div>

            {mode === 'host' && (
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-400 mb-2">房间ID（分享给好友）：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-900 rounded text-purple-300 font-mono text-sm">
                    {hostId}
                  </code>
                  <button
                    onClick={handleCopyId}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-300" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm text-gray-400 mb-3">当前玩家</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {playerName.charAt(0)}
                    </span>
                  </div>
                  <span className="text-white">{playerName}</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {mode === 'host' ? '房主' : '玩家'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold transition-all"
              >
                开始游戏
              </button>
              <button
                onClick={handleDisconnect}
                className="px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-all"
              >
                断开
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 text-center">
            支持最多 2 人联机合作
          </p>
        </div>
      </div>
    </div>
  );
}
