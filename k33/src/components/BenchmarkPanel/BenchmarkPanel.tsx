import React, { useState, useEffect } from 'react';
import { BarChart3, Play, Pause, TrendingUp, Zap, Target, Activity, Award, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { AlgorithmBenchmark, ComparisonReport, BenchmarkResult } from '../../engine/AlgorithmBenchmark';

interface BenchmarkPanelProps {
  benchmark: AlgorithmBenchmark | null;
  onRunBenchmark: () => void;
  onStopBenchmark: () => void;
}

export const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({
  benchmark,
  onRunBenchmark,
  onStopBenchmark,
}) => {
  const [progress, setProgress] = useState(0);
  const [currentAlgorithm, setCurrentAlgorithm] = useState('');
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (benchmark) {
        setIsRunning(benchmark.isBenchmarkRunning());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [benchmark]);

  const formatNumber = (num: number, decimals: number = 1) => {
    return num.toFixed(decimals);
  };

  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case 'totalTEU': return <TrendingUp size={14} className="text-green-400" />;
      case 'avgWaitTime': return <Clock size={14} className="text-yellow-400" />;
      case 'agvUtilization': return <Zap size={14} className="text-blue-400" />;
      case 'taskCompletionRate': return <Target size={14} className="text-purple-400" />;
      default: return <Activity size={14} className="text-gray-400" />;
    }
  };

  const getAlgorithmName = (algorithm: string) => {
    switch (algorithm) {
      case 'greedy': return '贪心算法';
      case 'hungarian': return '匈牙利算法';
      case 'ppo': return 'PPO强化学习';
      default: return algorithm;
    }
  };

  const getBestValueColor = (value: number, isLowerBetter: boolean = false, baseline?: number) => {
    if (baseline === undefined) return 'text-white';
    const diff = ((value - baseline) / baseline) * 100;
    if (isLowerBetter) {
      return diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-white';
    }
    return diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-white';
  };

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-amber-400" />
            <h3 className="text-lg font-semibold text-white">算法性能对比</h3>
          </div>
          <div className="flex gap-2">
            {!isRunning ? (
              <button
                onClick={onRunBenchmark}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
              >
                <Play size={14} />
                运行对比
              </button>
            ) : (
              <button
                onClick={onStopBenchmark}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
              >
                <Pause size={14} />
                停止
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isRunning && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">正在测试: {currentAlgorithm}</span>
              <span className="text-sm text-white">{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {report && (
          <>
            <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-4 border border-purple-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-purple-300 text-sm">
                    <Award size={16} />
                    最优算法
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {getAlgorithmName(report.summary.bestAlgorithm)}
                  </div>
                </div>
                {report.summary.improvement !== 0 && (
                  <div className="text-right">
                    <div className="text-sm text-gray-400">相比贪心算法</div>
                    <div className={`text-xl font-bold ${report.summary.improvement > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {report.summary.improvement > 0 ? '+' : ''}{report.summary.improvement.toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">算法</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">吞吐量</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">等待时间</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">AGV利用率</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">完成率</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((result, index) => {
                    const baseline = report.results.find(r => r.algorithm === 'greedy');
                    return (
                      <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {result.algorithm === report.summary.bestAlgorithm && (
                              <Award size={14} className="text-yellow-400" />
                            )}
                            <span className="text-sm text-white">{getAlgorithmName(result.algorithm)}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 text-right text-sm ${getBestValueColor(result.totalTEU, false, baseline?.totalTEU)}`}>
                          {formatNumber(result.totalTEU, 0)}
                        </td>
                        <td className={`px-3 py-2 text-right text-sm ${getBestValueColor(result.avgWaitTime, true, baseline?.avgWaitTime)}`}>
                          {formatNumber(result.avgWaitTime, 0)}s
                        </td>
                        <td className={`px-3 py-2 text-right text-sm ${getBestValueColor(result.agvUtilization, false, baseline?.agvUtilization)}`}>
                          {formatNumber(result.agvUtilization, 1)}%
                        </td>
                        <td className={`px-3 py-2 text-right text-sm ${getBestValueColor(result.taskCompletionRate, false, baseline?.taskCompletionRate)}`}>
                          {formatNumber(result.taskCompletionRate, 1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {Object.entries(report.summary.metrics).map(([metric, data]) => (
                <div key={metric} className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {getMetricIcon(metric)}
                    <span className="text-xs text-gray-400">{getMetricLabel(metric)}</span>
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {getAlgorithmName(data.best)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatNumber(data.value, metric === 'avgWaitTime' ? 0 : 1)}
                    {metric === 'avgWaitTime' ? 's' : metric !== 'totalTEU' ? '%' : ' TEU'}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">性能对比图表</h4>
              <div className="space-y-3">
                {report.results.map((result, index) => {
                  const maxTEU = Math.max(...report.results.map(r => r.totalTEU));
                  const width = (result.totalTEU / maxTEU) * 100;
                  return (
                    <div key={index}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-300">{getAlgorithmName(result.algorithm)}</span>
                        <span className="text-white">{formatNumber(result.totalTEU, 0)} TEU</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            result.algorithm === report.summary.bestAlgorithm
                              ? 'bg-gradient-to-r from-yellow-500 to-amber-400'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!report && !isRunning && (
          <div className="text-center py-12 text-gray-400">
            <BarChart3 size={48} className="mx-auto mb-3 opacity-50" />
            <p>点击"运行对比"开始算法性能测试</p>
            <p className="text-xs mt-2">测试将运行 {benchmark?.getConfig().numRuns || 5} 轮，每轮 {((benchmark?.getConfig().runDuration || 3600) / 60).toFixed(0)} 分钟</p>
          </div>
        )}
      </div>
    </div>
  );
};

function getMetricLabel(metric: string): string {
  switch (metric) {
    case 'totalTEU': return '吞吐量';
    case 'avgWaitTime': return '平均等待时间';
    case 'agvUtilization': return 'AGV利用率';
    case 'taskCompletionRate': return '任务完成率';
    default: return metric;
  }
}
