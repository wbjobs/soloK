import React, { useState } from 'react';
import { Play, Pause, RotateCcw, FastForward, Save, FolderOpen, Settings, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { SIMULATION_SPEEDS } from '../../utils/constants';
import { parseShipSchedule, exportShipScheduleTemplate } from '../../utils/excelParser';
import { SceneManager } from '../SceneManager/SceneManager';

export const ControlPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'control' | 'config' | 'scene'>('control');
  const [showSceneManager, setShowSceneManager] = useState(false);
  
  const {
    scene,
    start,
    pause,
    reset,
    setSpeed,
    updateConfig,
    importShipSchedules,
  } = useSimulationStore();

  const { isRunning, speed, currentTime } = scene.simulationState;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const schedules = await parseShipSchedule(file);
        importShipSchedules(schedules);
        alert(`成功导入 ${schedules.length} 条船舶计划`);
      } catch (error) {
        alert('导入失败: ' + (error as Error).message);
      }
    }
  };

  if (collapsed) {
    return (
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
        <button
          onClick={() => setCollapsed(false)}
          className="bg-gray-800/90 hover:bg-gray-700 text-white p-3 rounded-r-lg shadow-lg transition-all"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="absolute left-0 top-0 bottom-0 w-80 bg-gray-900/95 backdrop-blur-sm text-white z-10 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-blue-400">AGV 调度仿真器</h2>
          <button
            onClick={() => setCollapsed(true)}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-700">
          {[
            { id: 'control', label: '控制', icon: Play },
            { id: 'config', label: '配置', icon: Settings },
            { id: 'scene', label: '场景', icon: FolderOpen },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'control' && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">仿真控制</h3>
                <div className="flex gap-2">
                  {!isRunning ? (
                    <button
                      onClick={start}
                      className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <Play size={18} />
                      开始
                    </button>
                  ) : (
                    <button
                      onClick={pause}
                      className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <Pause size={18} />
                      暂停
                    </button>
                  )}
                  <button
                    onClick={reset}
                    className="bg-red-600 hover:bg-red-500 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <FastForward size={16} />
                  仿真速度
                </h3>
                <div className="grid grid-cols-5 gap-2">
                  {SIMULATION_SPEEDS.map(s => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        speed === s
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">仿真时间</h3>
                <div className="text-2xl font-mono text-blue-400">
                  {Math.floor(currentTime / 3600).toString().padStart(2, '0')}:
                  {Math.floor((currentTime % 3600) / 60).toString().padStart(2, '0')}:
                  {Math.floor(currentTime % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  实时速度: {speed}x
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">船舶计划</h3>
                <div className="space-y-2">
                  <label className="flex items-center justify-center gap-2 py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer transition-colors">
                    <Upload size={16} />
                    导入Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={exportShipScheduleTemplate}
                    className="w-full py-2 px-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    下载模板
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">AGV 参数</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400">最大速度 (m/s)</label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={scene.config.agvMaxSpeed}
                      onChange={(e) => updateConfig({ agvMaxSpeed: parseFloat(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-sm text-blue-400">{scene.config.agvMaxSpeed}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">加速度 (m/s²)</label>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={scene.config.agvMaxAcceleration}
                      onChange={(e) => updateConfig({ agvMaxAcceleration: parseFloat(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-sm text-blue-400">{scene.config.agvMaxAcceleration}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">电池容量 (%)</label>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      step="10"
                      value={scene.config.agvBatteryCapacity}
                      onChange={(e) => updateConfig({ agvBatteryCapacity: parseFloat(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-sm text-blue-400">{scene.config.agvBatteryCapacity}</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">干扰参数</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400">AGV 故障率</label>
                    <input
                      type="range"
                      min="0"
                      max="0.01"
                      step="0.001"
                      value={scene.config.agvFaultRate}
                      onChange={(e) => updateConfig({ agvFaultRate: parseFloat(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-sm text-blue-400">{(scene.config.agvFaultRate * 100).toFixed(2)}%</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">故障持续时间 (秒)</label>
                    <input
                      type="range"
                      min="10"
                      max="120"
                      step="5"
                      value={scene.config.agvFaultDuration}
                      onChange={(e) => updateConfig({ agvFaultDuration: parseFloat(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-sm text-blue-400">{scene.config.agvFaultDuration}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">岸桥时间波动</label>
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.05"
                      value={scene.config.quayCraneTimeVariation}
                      onChange={(e) => updateConfig({ quayCraneTimeVariation: parseFloat(e.target.value) })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-sm text-blue-400">{(scene.config.quayCraneTimeVariation * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">调度算法</h3>
                <div className="space-y-2">
                  <select
                    value={scene.config.taskAssignmentAlgorithm}
                    onChange={(e) => updateConfig({ taskAssignmentAlgorithm: e.target.value as any })}
                    className="w-full bg-gray-700 text-white rounded-lg py-2 px-3 text-sm"
                  >
                    <option value="greedy">贪心算法</option>
                    <option value="hungarian">匈牙利算法</option>
                  </select>
                  <select
                    value={scene.config.deadlockAvoidance}
                    onChange={(e) => updateConfig({ deadlockAvoidance: e.target.value as any })}
                    className="w-full bg-gray-700 text-white rounded-lg py-2 px-3 text-sm"
                  >
                    <option value="none">无死锁避免</option>
                    <option value="banker">银行家算法</option>
                    <option value="reservation">资源预留</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scene' && (
            <div className="space-y-4">
              <button
                onClick={() => setShowSceneManager(true)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <FolderOpen size={18} />
                场景管理
              </button>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">当前场景</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">名称</span>
                    <span>{scene.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">AGV数量</span>
                    <span>{scene.agvs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">岸桥数量</span>
                    <span>{scene.quayCranes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">场桥数量</span>
                    <span>{scene.yardCranes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">堆场箱区</span>
                    <span>{scene.yardBlocks.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSceneManager && (
        <SceneManager onClose={() => setShowSceneManager(false)} />
      )}
    </>
  );
};
