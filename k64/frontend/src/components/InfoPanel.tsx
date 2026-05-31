import { useMemo } from 'react';
import { Atom, Zap, Timer, HardDrive, Activity, Video, Gauge } from 'lucide-react';
import useSimulationStore from '../store/useSimulationStore';

export default function InfoPanel() {
  const { scalarFrame, isConnected, isLoading, error, electricField, recordingStatus } = useSimulationStore();

  const formattedValues = useMemo(() => {
    if (!scalarFrame) return null;
    return {
      kineticEnergy: scalarFrame.kinetic_energy.toFixed(4),
      potentialEnergy: scalarFrame.potential_energy.toFixed(4),
      totalEnergy: scalarFrame.total_energy.toFixed(4),
      step: scalarFrame.step.toLocaleString(),
      time: scalarFrame.time.toFixed(6),
    };
  }, [scalarFrame]);

  const statusIndicator = useMemo(() => {
    if (error) return { color: 'bg-red-500', text: '错误', pulse: false };
    if (isLoading) return { color: 'bg-yellow-500', text: '连接中...', pulse: true };
    if (isConnected) return { color: 'bg-green-500', text: '已连接', pulse: true };
    return { color: 'bg-gray-500', text: '未连接', pulse: false };
  }, [isConnected, isLoading, error]);

  return (
    <div className="absolute top-4 right-4 z-10 w-80">
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Atom className="w-5 h-5 text-cyber-cyan" />
            <h2 className="font-display text-lg font-bold text-white tracking-wider">
              系统状态
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${statusIndicator.color} ${statusIndicator.pulse ? 'animate-pulse' : ''}`}
            />
            <span className="text-xs text-gray-400">{statusIndicator.text}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {formattedValues ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Activity className="w-4 h-4 text-energy-hot" />
                  <span>总动能</span>
                </div>
                <span className="data-value text-lg font-bold text-energy-hot text-glow">
                  {formattedValues.kineticEnergy}
                </span>
              </div>

              <div className="w-full h-1.5 bg-space-blue rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-energy-cool to-energy-hot transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, (scalarFrame?.kinetic_energy ?? 0) / 20 * 100))}%`
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-space-blue/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
                  <Zap className="w-3 h-3 text-cyber-blue" />
                  <span>势能</span>
                </div>
                <span className="data-value text-cyber-blue font-bold">
                  {formattedValues.potentialEnergy}
                </span>
              </div>

              <div className="bg-space-blue/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
                  <Zap className="w-3 h-3 text-cyber-purple" />
                  <span>总能量</span>
                </div>
                <span className="data-value text-cyber-purple font-bold">
                  {formattedValues.totalEnergy}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-space-blue/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
                  <Timer className="w-3 h-3 text-cyber-cyan" />
                  <span>步数</span>
                </div>
                <span className="data-value text-cyber-cyan font-bold">
                  {formattedValues.step}
                </span>
              </div>

              <div className="bg-space-blue/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
                  <Timer className="w-3 h-3 text-cyber-cyan" />
                  <span>时间</span>
                </div>
                <span className="data-value text-cyber-cyan font-bold">
                  {formattedValues.time}
                </span>
              </div>
            </div>

            <div className="bg-space-blue/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
                <Atom className="w-3 h-3 text-cyber-cyan" />
                <span>粒子数量</span>
              </div>
              <span className="data-value text-cyber-cyan font-bold">
                1,000
              </span>
            </div>

            <div className="bg-space-blue/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-2">
                <Gauge className="w-3 h-3 text-cyber-purple" />
                <span>速度颜色映射</span>
              </div>
              <div className="h-3 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-red-500" />
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>慢 0.0</span>
                <span>快 3.0</span>
              </div>
            </div>

            {scalarFrame?.snapshot_saved && (
              <div className="flex items-center gap-2 p-3 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded-lg animate-pulse">
                <HardDrive className="w-4 h-4 text-cyber-cyan" />
                <span className="text-sm text-cyber-cyan">HDF5 快照已保存</span>
              </div>
            )}

            {recordingStatus.is_recording && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-400">
                  录制中 · {recordingStatus.frame_count} 帧
                </span>
              </div>
            )}

            {(Math.abs(electricField.E_x) > 0.01 || Math.abs(electricField.E_y) > 0.01 || Math.abs(electricField.E_z) > 0.01) && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-yellow-400">电场激活</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-red-400">Ex:</span>{' '}
                    <span className="text-white">{electricField.E_x.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-green-400">Ey:</span>{' '}
                    <span className="text-white">{electricField.E_y.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-blue-400">Ez:</span>{' '}
                    <span className="text-white">{electricField.E_z.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="animate-spin w-8 h-8 border-2 border-cyber-cyan/30 border-t-cyber-cyan rounded-full mx-auto mb-3" />
            <p className="text-sm">等待模拟数据...</p>
          </div>
        )}
      </div>
    </div>
  );
}
