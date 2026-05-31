import { Heart, Zap, Trophy, Layers } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { SKILLS } from '../game/data/skills';

export function HUD() {
  const {
    playerHealth,
    playerMaxHealth,
    score,
    floor,
    equippedSkills
  } = useGameStore();

  const healthPercent = (playerHealth / playerMaxHealth) * 100;

  return (
    <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none">
      <div className="flex justify-between items-start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500 fill-red-500" />
            <div className="w-48 h-6 bg-gray-800 rounded-full overflow-hidden border-2 border-gray-700">
              <div
                className="h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${healthPercent}%`,
                  background: healthPercent > 50
                    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                    : healthPercent > 25
                      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                      : 'linear-gradient(90deg, #ef4444, #f87171)'
                }}
              />
            </div>
            <span className="text-white font-bold text-sm">
              {playerHealth}/{playerMaxHealth}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-yellow-400 font-bold">{score}</span>
          </div>

          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" />
            <span className="text-purple-400 font-bold">第 {floor} 层</span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-gray-400 text-xs">WASD 移动 | 鼠标点击释放技能</p>
          <p className="text-gray-400 text-xs">1-4 切换技能 | E 技能面板 | R 配方书</p>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3">
        {equippedSkills.map((skillId, index) => {
          const skill = skillId ? SKILLS[skillId] : null;
          return (
            <div
              key={index}
              className={`w-16 h-16 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                skill
                  ? 'bg-gray-800/90 border-purple-500 hover:border-purple-400'
                  : 'bg-gray-900/80 border-gray-700'
              }`}
              style={{ boxShadow: skill ? `0 0 15px ${skill.color}40` : 'none' }}
            >
              <span className="text-2xl">{skill?.icon || '?'}</span>
              <span className="text-xs text-gray-400 mt-1">{index + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
