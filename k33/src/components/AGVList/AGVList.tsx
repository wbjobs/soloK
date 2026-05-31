import React from 'react';
import { Battery, AlertTriangle, Navigation, Clock } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { COLORS } from '../../utils/constants';

export const AGVList: React.FC = () => {
  const { scene, selectedAGVId, selectAGV, triggerAGVFault } = useSimulationStore();

  const getStatusColor = (status: string) => {
    return COLORS.agv[status as keyof typeof COLORS.agv] || COLORS.agv.idle;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'idle': return '空闲';
      case 'moving': return '移动';
      case 'loading': return '装货';
      case 'unloading': return '卸货';
      case 'charging': return '充电';
      case 'fault': return '故障';
      default: return status;
    }
  };

  return (
    <div className="absolute left-0 right-0 bottom-0 h-24 bg-gray-900/95 backdrop-blur-sm border-t border-gray-700 z-10">
      <div className="flex items-center h-full px-4 gap-2 overflow-x-auto">
        {scene.agvs.map(agv => (
          <div
            key={agv.id}
            onClick={() => selectAGV(agv.id)}
            className={`flex-shrink-0 w-44 bg-gray-800 rounded-lg p-3 cursor-pointer transition-all border-2 ${
              selectedAGVId === agv.id
                ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                : 'border-transparent hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">{agv.name}</span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getStatusColor(agv.status) }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-12">状态</span>
                <span className="text-white">{getStatusText(agv.status)}</span>
              </div>

              <div className="flex items-center gap-2">
                <Battery size={12} className={agv.battery < 20 ? 'text-red-400' : 'text-green-400'} />
                <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      agv.battery < 20 ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${agv.battery}%` }}
                  />
                </div>
                <span className={`text-xs font-mono ${agv.battery < 20 ? 'text-red-400' : 'text-white'}`}>
                  {agv.battery.toFixed(0)}%
                </span>
              </div>

              {agv.status === 'moving' && (
                <div className="flex items-center gap-2 text-xs text-cyan-400">
                  <Navigation size={12} />
                  <span>{agv.velocity.linear.toFixed(1)} m/s</span>
                </div>
              )}

              {agv.status === 'fault' && agv.faultTimer > 0 && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertTriangle size={12} />
                  <span>恢复: {agv.faultTimer.toFixed(0)}s</span>
                </div>
              )}

              {agv.currentTask && (
                <div className="text-xs text-gray-400 truncate mt-1 pt-1 border-t border-gray-700">
                  {agv.currentTask.containerId}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
