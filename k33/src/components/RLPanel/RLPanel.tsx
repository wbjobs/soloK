import React, { useState, useEffect } from 'react';
import { Brain, Play, Pause, TrendingUp, Zap, Target, Activity, Save, Upload } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { RLScheduler, TrainingStats } from '../../engine/rl/RLScheduler';

interface RLPanelProps {
  rlScheduler: RLScheduler | null;
  onStartTraining: () => void;
  onStopTraining: () => void;
  onSaveModel: () => void;
  onLoadModel: () => void;
}

export const RLPanel: React.FC<RLPanelProps> = ({
  rlScheduler,
  onStartTraining,
  onStopTraining,
  onSaveModel,
  onLoadModel,
}) => {
  const [trainingProgress, setTrainingProgress] = useState({
    episode: 0,
    explorationRate: 1.0,
    episodeReward: 0,
    isTraining: false,
  });

  const [history, setHistory] = useState<TrainingStats[]>([]);

  useEffect(() => {
    if (rlScheduler) {
      const progress = rlScheduler.getTrainingProgress();
      setTrainingProgress(progress);
      setHistory(rlScheduler.getTrainingHistory());
    }
  }, [rlScheduler]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (rlScheduler && rlScheduler.isTrainingMode()) {
        const progress = rlScheduler.getTrainingProgress();
        setTrainingProgress(progress);
        setHistory(rlScheduler.getTrainingHistory());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rlScheduler]);

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toFixed(decimals);
  };

  const getLatestStats = () => {
    if (history.length === 0) return null;
    return history[history.length - 1];
  };

  const latestStats = getLatestStats();

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-purple-400" />
            <h3 className="text-lg font-semibold text-white">强化学习调度</h3>
          </div>
          <div className="flex gap-2">
            {!trainingProgress.isTraining ? (
              <button
                onClick={onStartTraining}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
              >
                <Play size={14} />
                开始训练
              </button>
            ) : (
              <button
                onClick={onStopTraining}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
              >
                <Pause size={14} />
                停止训练
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
              <Target size={12} />
              回合
            </div>
            <div className="text-xl font-bold text-white">{trainingProgress.episode}</div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
              <Activity size={12} />
              探索率
            </div>
            <div className="text-xl font-bold text-yellow-400">
              {formatNumber(trainingProgress.explorationRate * 100, 1)}%
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
              <Zap size={12} />
              奖励
            </div>
            <div className={`text-xl font-bold ${trainingProgress.episodeReward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatNumber(trainingProgress.episodeReward, 1)}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
              <TrendingUp size={12} />
              状态
            </div>
            <div className={`text-sm font-semibold ${trainingProgress.isTraining ? 'text-green-400' : 'text-gray-400'}`}>
              {trainingProgress.isTraining ? '训练中' : '已停止'}
            </div>
          </div>
        </div>

        {latestStats && (
          <div className="bg-gray-800 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-300 mb-3">最新训练指标</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">吞吐量 (TEU)</span>
                <span className="text-white font-medium">{latestStats.throughput}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">AGV利用率</span>
                <span className="text-white font-medium">{formatNumber(latestStats.agvUtilization, 1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">平均等待时间</span>
                <span className="text-white font-medium">{formatNumber(latestStats.avgWaitTime, 0)}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">平均奖励</span>
                <span className="text-white font-medium">{formatNumber(latestStats.averageReward, 2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onSaveModel}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
          >
            <Save size={14} />
            保存模型
          </button>
          <button
            onClick={onLoadModel}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
          >
            <Upload size={14} />
            加载模型
          </button>
        </div>

        {history.length > 1 && (
          <div className="bg-gray-800 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-300 mb-3">训练曲线</h4>
            <div className="h-32 flex items-end gap-0.5">
              {history.slice(-50).map((stats, i) => {
                const maxReward = Math.max(...history.slice(-50).map(s => Math.abs(s.totalReward)), 1);
                const height = (Math.abs(stats.totalReward) / maxReward) * 100;
                const color = stats.totalReward >= 0 ? 'bg-green-500' : 'bg-red-500';
                return (
                  <div
                    key={i}
                    className={`${color} flex-1 rounded-t transition-all`}
                    style={{ height: `${Math.max(2, height)}%` }}
                    title={`回合 ${stats.episode}: ${formatNumber(stats.totalReward, 2)}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>回合 {history[0]?.episode || 0}</span>
              <span>回合 {history[history.length - 1]?.episode || 0}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
