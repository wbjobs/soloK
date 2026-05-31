import { Play, BookOpen, Trash2, Users } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { clearAllData, loadGameStats } from '../game/utils/storage';
import { useState, useEffect } from 'react';
import { NetworkPanel } from './NetworkPanel';

export function MainMenu() {
  const { setGameState, loadPersistentData } = useGameStore();
  const [stats, setStats] = useState<{ highScore: number; deepestFloor: number; discoveredRecipes: number; unlockedSkills: number } | null>(null);
  const [showNetworkPanel, setShowNetworkPanel] = useState(false);

  useEffect(() => {
    const gameStats = loadGameStats();
    setStats({
      highScore: gameStats.highScore,
      deepestFloor: gameStats.deepestFloor,
      discoveredRecipes: gameStats.discoveredRecipes.length,
      unlockedSkills: gameStats.unlockedSkills.length
    });
  }, []);

  const handleStart = () => {
    loadPersistentData();
    setGameState('playing');
  };

  const handleClearData = () => {
    if (confirm('确定要清除所有存档数据吗？此操作不可恢复！')) {
      clearAllData();
      setStats({
        highScore: 0,
        deepestFloor: 1,
        discoveredRecipes: 0,
        unlockedSkills: 0
      });
      useGameStore.getState().addNotification('存档已清除', 'info');
    }
  };

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-purple-950 via-gray-950 to-black flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.3) 2px,
            rgba(0, 0, 0, 0.3) 4px
          )`
        }}
      />

      <div className="relative z-10 text-center">
        <div className="mb-12">
          <h1
            className="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-500 to-yellow-500 bg-clip-text text-transparent"
            style={{ fontFamily: "'Press Start 2P', cursive", textShadow: '0 0 40px rgba(168, 85, 247, 0.5)' }}
          >
            地牢
          </h1>
          <h2
            className="text-4xl font-bold text-purple-300"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            技能大师
          </h2>
          <p className="text-gray-400 mt-4 text-lg">收集技能，组合配方，征服地牢！</p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-8 max-w-md mx-auto">
            <div className="bg-gray-900/80 p-4 rounded-lg border border-purple-800">
              <p className="text-yellow-400 text-2xl font-bold">{stats.highScore}</p>
              <p className="text-gray-500 text-sm">最高分</p>
            </div>
            <div className="bg-gray-900/80 p-4 rounded-lg border border-purple-800">
              <p className="text-purple-400 text-2xl font-bold">第 {stats.deepestFloor} 层</p>
              <p className="text-gray-500 text-sm">最深记录</p>
            </div>
            <div className="bg-gray-900/80 p-4 rounded-lg border border-green-800">
              <p className="text-green-400 text-2xl font-bold">{stats.discoveredRecipes}</p>
              <p className="text-gray-500 text-sm">已发现配方</p>
            </div>
            <div className="bg-gray-900/80 p-4 rounded-lg border border-blue-800">
              <p className="text-blue-400 text-2xl font-bold">{stats.unlockedSkills}</p>
              <p className="text-gray-500 text-sm">已解锁技能</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleStart}
            className="group w-64 px-8 py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 hover:from-purple-500 hover:via-pink-500 hover:to-orange-500 text-white rounded-xl font-bold text-xl transition-all transform hover:scale-105 shadow-lg hover:shadow-purple-500/50 flex items-center justify-center gap-3 mx-auto"
          >
            <Play className="w-6 h-6 group-hover:animate-pulse" />
            开始游戏
          </button>

          <button
            onClick={() => setShowNetworkPanel(true)}
            className="w-64 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2 mx-auto"
          >
            <Users className="w-5 h-5" />
            联机合作
          </button>

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => useGameStore.getState().toggleRecipeBook()}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-bold transition-all flex items-center gap-2"
            >
              <BookOpen className="w-5 h-5" />
              配方书
            </button>
            <button
              onClick={handleClearData}
              className="px-6 py-3 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 rounded-lg font-bold transition-all flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              清除存档
            </button>
          </div>
          <NetworkPanel isOpen={showNetworkPanel} onClose={() => setShowNetworkPanel(false)} />
        </div>

        <div className="mt-12 text-gray-500 text-sm space-y-1">
          <p>🎮 WASD / 方向键 移动</p>
          <p>🖱️ 鼠标点击释放技能 | 1-4 切换技能</p>
          <p>📦 E 技能面板 | R 配方书 | ESC 暂停</p>
        </div>
      </div>
    </div>
  );
}
