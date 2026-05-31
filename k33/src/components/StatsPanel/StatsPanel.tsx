import React, { useState } from 'react';
import { BarChart3, Truck, Clock, Zap, AlertTriangle, MapPin, Eye, EyeOff, FileText } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { COLORS } from '../../utils/constants';
import { ReportModal } from '../ReportModal/ReportModal';

export const StatsPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  
  const {
    scene,
    showHeatmap,
    toggleHeatmap,
    showPaths,
    togglePaths,
    showRoadNetwork,
    toggleRoadNetwork,
    cameraMode,
    setCameraMode,
    selectedAGVId,
    generateReport,
  } = useSimulationStore();

  const handleGenerateReport = () => {
    const report = generateReport();
    setReportData(report);
    setShowReport(true);
  };

  const {
    totalTEU,
    teuPerHour,
    averageWaitTime,
    maxWaitTime,
    agvUtilization,
    craneUtilization,
    deadlockCount,
    faultCount,
    taskCompletionRate,
  } = scene.simulationState;

  const selectedAGV = scene.agvs.find(a => a.id === selectedAGVId);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(1)}秒`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}分钟`;
    return `${(seconds / 3600).toFixed(2)}小时`;
  };

  if (collapsed) {
    return (
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
        <button
          onClick={() => setCollapsed(false)}
          className="bg-gray-800/90 hover:bg-gray-700 text-white p-3 rounded-l-lg shadow-lg transition-all"
        >
          <BarChart3 size={24} />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute right-4 top-4 bottom-24 w-72 z-10 flex flex-col gap-3 pointer-events-none">
      <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 text-white shadow-2xl pointer-events-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">实时统计</h3>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <EyeOff size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">吞吐量 (TEU)</div>
            <div className="text-xl font-bold text-blue-400">{totalTEU}</div>
            <div className="text-xs text-gray-500">{teuPerHour.toFixed(1)}/小时</div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">平均等待时间</div>
            <div className="text-xl font-bold text-yellow-400">{formatTime(averageWaitTime)}</div>
            <div className="text-xs text-gray-500">最长: {formatTime(maxWaitTime)}</div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">AGV利用率</div>
            <div className="text-xl font-bold text-green-400">{agvUtilization.toFixed(1)}%</div>
            <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, agvUtilization)}%`,
                  backgroundColor: agvUtilization > 85 ? COLORS.danger : COLORS.success,
                }}
              />
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">岸桥利用率</div>
            <div className="text-xl font-bold text-purple-400">{craneUtilization.toFixed(1)}%</div>
            <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, craneUtilization)}%`,
                  backgroundColor: craneUtilization > 85 ? COLORS.danger : '#A855F7',
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-lg font-bold text-red-400">{deadlockCount}</div>
            <div className="text-xs text-gray-400">死锁</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-lg font-bold text-orange-400">{faultCount}</div>
            <div className="text-xs text-gray-400">故障</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-lg font-bold text-cyan-400">{taskCompletionRate.toFixed(0)}%</div>
            <div className="text-xs text-gray-400">完成率</div>
          </div>
        </div>
      </div>

      {selectedAGV && (
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 text-white shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-400">{selectedAGV.name}</h3>
            <span className={`text-xs px-2 py-1 rounded ${
              selectedAGV.status === 'moving' ? 'bg-blue-600' :
              selectedAGV.status === 'charging' ? 'bg-green-600' :
              selectedAGV.status === 'fault' ? 'bg-red-600' :
              selectedAGV.status === 'loading' || selectedAGV.status === 'unloading' ? 'bg-yellow-600' :
              'bg-gray-600'
            }`}>
              {selectedAGV.status === 'idle' ? '空闲' :
               selectedAGV.status === 'moving' ? '移动中' :
               selectedAGV.status === 'loading' ? '装货中' :
               selectedAGV.status === 'unloading' ? '卸货中' :
               selectedAGV.status === 'charging' ? '充电中' : '故障'}
            </span>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">电量</span>
              <span className={selectedAGV.battery < 20 ? 'text-red-400' : 'text-green-400'}>
                {selectedAGV.battery.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${selectedAGV.battery < 20 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${selectedAGV.battery}%` }}
              />
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-400">速度</span>
              <span>{selectedAGV.velocity.linear.toFixed(1)} m/s</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-400">总行驶</span>
              <span>{selectedAGV.totalDistance.toFixed(2)} km</span>
            </div>

            {selectedAGV.currentTask && (
              <div className="mt-2 pt-2 border-t border-gray-700">
                <div className="text-xs text-gray-400 mb-1">当前任务</div>
                <div className="text-xs truncate">{selectedAGV.currentTask.containerId}</div>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setCameraMode(cameraMode === 'follow' ? 'free' : 'follow')}
              className={`flex-1 py-2 px-3 rounded text-xs font-medium transition-colors ${
                cameraMode === 'follow'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {cameraMode === 'follow' ? '取消跟随' : '跟随视角'}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={handleGenerateReport}
        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-lg pointer-events-auto"
      >
        <FileText size={18} />
        生成仿真报告
      </button>

      <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 text-white shadow-2xl pointer-events-auto">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">显示选项</h3>
        <div className="space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm flex items-center gap-2">
              <MapPin size={14} className="text-red-400" />
              热力图
            </span>
            <button
              onClick={toggleHeatmap}
              className={`w-10 h-5 rounded-full transition-colors ${
                showHeatmap ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  showHeatmap ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
          
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm flex items-center gap-2">
              <Eye size={14} className="text-blue-400" />
              路径显示
            </span>
            <button
              onClick={togglePaths}
              className={`w-10 h-5 rounded-full transition-colors ${
                showPaths ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  showPaths ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
          
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm flex items-center gap-2">
              <Truck size={14} className="text-yellow-400" />
              道路网络
            </span>
            <button
              onClick={toggleRoadNetwork}
              className={`w-10 h-5 rounded-full transition-colors ${
                showRoadNetwork ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  showRoadNetwork ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {scene.agvs.filter(a => a.status === 'fault').length > 0 && (
        <div className="bg-red-900/90 backdrop-blur-sm rounded-lg p-3 text-white shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">
              {scene.agvs.filter(a => a.status === 'fault').length} 台AGV故障
            </span>
          </div>
        </div>
      )}

      {showReport && reportData && (
        <ReportModal report={reportData} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
};
