import React, { useMemo } from 'react';
import { X, Download, TrendingUp, Clock, Truck, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react';
import { KPIReport } from '../../types';
import { formatTime } from '../../utils/math';

interface ReportModalProps {
  report: KPIReport;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ report, onClose }) => {
  const exportReport = () => {
    const reportData = {
      ...report,
      generatedAt: new Date().toISOString(),
    };
    const dataStr = JSON.stringify(reportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `仿真报告_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-900/30';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30';
      case 'low': return 'text-green-400 bg-green-900/30';
      default: return 'text-gray-400 bg-gray-800';
    }
  };

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return severity;
    }
  };

  const ganttChartData = useMemo(() => {
    if (report.ganttData.length === 0) return [];
    
    const maxTime = Math.max(...report.ganttData.map(d => d.endTime));
    const timeScale = 600 / maxTime;
    
    return report.ganttData.slice(-20).map((item, index) => ({
      ...item,
      left: item.startTime * timeScale,
      width: Math.max(2, (item.endTime - item.startTime) * timeScale),
      row: index % 5,
    }));
  }, [report.ganttData]);

  const typeColors: Record<string, string> = {
    travel_to_load: '#3B82F6',
    loading: '#F59E0B',
    travel_to_unload: '#8B5CF6',
    unloading: '#10B981',
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <BarChart3 size={28} className="text-blue-400" />
              仿真报告
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              生成时间: {new Date(report.timestamp).toLocaleString('zh-CN')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportReport}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <Download size={18} />
              导出报告
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X size={24} className="text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-xl p-4 border border-blue-700/50">
              <div className="flex items-center gap-2 text-blue-300 text-sm mb-2">
                <Truck size={16} />
                总吞吐量
              </div>
              <div className="text-3xl font-bold text-white">{report.totalTEU}</div>
              <div className="text-sm text-blue-300 mt-1">TEU</div>
            </div>

            <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 rounded-xl p-4 border border-green-700/50">
              <div className="flex items-center gap-2 text-green-300 text-sm mb-2">
                <TrendingUp size={16} />
                作业效率
              </div>
              <div className="text-3xl font-bold text-white">{report.teuPerHour.toFixed(1)}</div>
              <div className="text-sm text-green-300 mt-1">TEU/小时</div>
            </div>

            <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 rounded-xl p-4 border border-yellow-700/50">
              <div className="flex items-center gap-2 text-yellow-300 text-sm mb-2">
                <Clock size={16} />
                平均等待时间
              </div>
              <div className="text-3xl font-bold text-white">{formatTime(report.averageWaitTime)}</div>
              <div className="text-sm text-yellow-300 mt-1">最长: {formatTime(report.maxWaitTime)}</div>
            </div>

            <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 rounded-xl p-4 border border-purple-700/50">
              <div className="flex items-center gap-2 text-purple-300 text-sm mb-2">
                <CheckCircle size={16} />
                任务完成率
              </div>
              <div className="text-3xl font-bold text-white">{report.taskCompletionRate.toFixed(1)}%</div>
              <div className="text-sm text-purple-300 mt-1">{report.completedTasks}/{report.totalTasks} 任务</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">资源利用率</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">AGV利用率</span>
                    <span className="text-white font-medium">{report.agvUtilization.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${Math.min(100, report.agvUtilization)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">岸桥利用率</span>
                    <span className="text-white font-medium">{report.craneUtilization.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(100, report.craneUtilization)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">异常统计</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{report.deadlockCount}</div>
                  <div className="text-sm text-gray-400">死锁次数</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-orange-400">{report.faultCount}</div>
                  <div className="text-sm text-gray-400">故障次数</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center col-span-2">
                  <div className="text-2xl font-bold text-cyan-400">{formatTime(report.simulationDuration)}</div>
                  <div className="text-sm text-gray-400">总仿真时长</div>
                </div>
              </div>
            </div>
          </div>

          {report.bottleneckAnalysis.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-5 mb-8">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-yellow-400" />
                瓶颈分析
              </h3>
              <div className="space-y-3">
                {report.bottleneckAnalysis.map((item, index) => (
                  <div key={index} className="bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(item.severity)}`}>
                            {getSeverityText(item.severity)}
                          </span>
                          <span className="text-white font-medium">{item.name}</span>
                        </div>
                        <p className="text-sm text-gray-400">{item.description}</p>
                        <p className="text-sm text-blue-400 mt-1">建议: {item.suggestion}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ganttChartData.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">作业甘特图 (最近20条)</h3>
              <div className="relative">
                <div className="flex justify-between text-xs text-gray-400 mb-2 px-2">
                  <span>0</span>
                  <span>{formatTime(Math.max(...report.ganttData.map(d => d.endTime)) / 2)}</span>
                  <span>{formatTime(Math.max(...report.ganttData.map(d => d.endTime)))}</span>
                </div>
                <div className="space-y-1">
                  {ganttChartData.map((item, index) => (
                    <div key={index} className="relative h-6 bg-gray-700/30 rounded">
                      <div
                        className="absolute top-1 h-4 rounded transition-all"
                        style={{
                          left: `${item.left}px`,
                          width: `${item.width}px`,
                          backgroundColor: typeColors[item.type] || '#6B7280',
                        }}
                        title={`${item.name} - ${formatTime(item.startTime)} ~ ${formatTime(item.endTime)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-4 text-xs">
                  {Object.entries(typeColors).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                      <span className="text-gray-400">
                        {type === 'travel_to_load' ? '前往装货' :
                         type === 'loading' ? '装货' :
                         type === 'travel_to_unload' ? '前往卸货' : '卸货'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
