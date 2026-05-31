import React, { useState, useEffect } from 'react';
import { Link2, AlertTriangle, Clock, TrendingUp, Activity, Database, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { DigitalTwin, SyncReport, PredictionResult } from '../../engine/digitalTwin/DigitalTwin';
import { PredictionEngine } from '../../engine/digitalTwin/PredictionEngine';
import { TOSSimulator } from '../../engine/digitalTwin/TOSSimulator';

interface DigitalTwinPanelProps {
  digitalTwin: DigitalTwin | null;
  predictionEngine: PredictionEngine | null;
  tosSimulator: TOSSimulator | null;
  onStartSync: () => void;
  onStopSync: () => void;
  onManualSync: () => void;
}

export const DigitalTwinPanel: React.FC<DigitalTwinPanelProps> = ({
  digitalTwin,
  predictionEngine,
  tosSimulator,
  onStartSync,
  onStopSync,
  onManualSync,
}) => {
  const [syncStatus, setSyncStatus] = useState({
    isSyncing: false,
    lastSyncTime: 0,
    historySize: 0,
  });

  const [latestPrediction, setLatestPrediction] = useState<PredictionResult | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);

  useEffect(() => {
    if (digitalTwin) {
      setSyncStatus(digitalTwin.getSyncStatus());
    }
  }, [digitalTwin]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (digitalTwin) {
        setSyncStatus(digitalTwin.getSyncStatus());
      }
      if (predictionEngine && predictionEngine.isRunning()) {
        const prediction = predictionEngine.getLatestPrediction();
        if (prediction) {
          setLatestPrediction(prediction);
          setAlerts(predictionEngine.getAlerts(Date.now() / 1000));
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [digitalTwin, predictionEngine]);

  const formatTime = (timestamp: number) => {
    if (timestamp === 0) return '从未同步';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'critical': return '严重';
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '未知';
    }
  };

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 size={20} className="text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">数字孪生同步</h3>
          </div>
          <div className="flex items-center gap-2">
            {syncStatus.isSyncing ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <Wifi size={14} />
                同步中
              </span>
            ) : (
              <span className="flex items-center gap-1 text-gray-400 text-sm">
                <WifiOff size={14} />
                未连接
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
              <Clock size={12} />
              上次同步
            </div>
            <div className="text-sm font-medium text-white">{formatTime(syncStatus.lastSyncTime)}</div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
              <Database size={12} />
              历史数据
            </div>
            <div className="text-sm font-medium text-white">{syncStatus.historySize} 条</div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
              <Activity size={12} />
              预测引擎
            </div>
            <div className={`text-sm font-medium ${predictionEngine?.isRunning() ? 'text-green-400' : 'text-gray-400'}`}>
              {predictionEngine?.isRunning() ? '运行中' : '已停止'}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!syncStatus.isSyncing ? (
            <button
              onClick={onStartSync}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
            >
              <RefreshCw size={14} />
              开始同步
            </button>
          ) : (
            <button
              onClick={onStopSync}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
            >
              <WifiOff size={14} />
              停止同步
            </button>
          )}
          <button
            onClick={onManualSync}
            className="py-2 px-3 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            手动同步
          </button>
        </div>

        {syncReport && (
          <div className="bg-gray-800 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-300 mb-2">同步报告</h4>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">AGV同步</span>
                <span className="text-green-400">{syncReport.agvSynced}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">任务同步</span>
                <span className="text-green-400">{syncReport.taskSynced}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">设备同步</span>
                <span className="text-green-400">{syncReport.craneSynced}</span>
              </div>
            </div>
            {syncReport.deviations.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-700">
                <div className="text-xs text-yellow-400 mb-1">
                  检测到 {syncReport.deviations.length} 个偏差
                </div>
              </div>
            )}
          </div>
        )}

        {latestPrediction && (
          <div className="bg-gray-800 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <TrendingUp size={14} />
              预测分析 (置信度: {(latestPrediction.confidence * 100).toFixed(1)}%)
            </h4>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">预测吞吐量</div>
                <div className="text-lg font-semibold text-white">
                  {latestPrediction.predictions.throughputForecast.toFixed(1)} TEU
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">AGV利用率预测</div>
                <div className="text-lg font-semibold text-white">
                  {latestPrediction.predictions.agvUtilizationForecast.toFixed(1)}%
                </div>
              </div>
            </div>

            {latestPrediction.predictions.congestionZones.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-2">预测拥堵区域</div>
                <div className="space-y-1">
                  {latestPrediction.predictions.congestionZones.slice(0, 3).map((zone, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getSeverityColor(zone.severity)}`} />
                        <span className="text-gray-300">
                          ({zone.position.x.toFixed(0)}, {zone.position.y.toFixed(0)})
                        </span>
                      </div>
                      <span className="text-gray-400">
                        {Math.ceil(zone.duration / 60)}分钟
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {latestPrediction.predictions.bottlenecks.length > 0 && (
              <div className="pt-2 border-t border-gray-700">
                <div className="text-xs text-yellow-400 mb-1">瓶颈警告</div>
                <div className="text-xs text-gray-400">
                  {latestPrediction.predictions.bottlenecks[0]}
                </div>
              </div>
            )}
          </div>
        )}

        {alerts.length > 0 && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
              <AlertTriangle size={14} />
              预警信息
            </div>
            <div className="space-y-1">
              {alerts.slice(0, 3).map((alert, i) => (
                <div key={i} className="text-xs text-red-300">{alert}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
