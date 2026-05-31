import { useState, useCallback, useEffect } from 'react';
import { Zap, RotateCcw, Sliders } from 'lucide-react';
import useSimulationStore from '../store/useSimulationStore';
import { setElectricField as apiSetElectricField } from '../hooks/useSimulation';

export default function ElectricFieldPanel() {
  const electricField = useSimulationStore((s) => s.electricField);
  const [localField, setLocalField] = useState({
    E_x: 0,
    E_y: 0,
    E_z: 0,
  });
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setLocalField({
      E_x: electricField.E_x,
      E_y: electricField.E_y,
      E_z: electricField.E_z,
    });
  }, [electricField]);

  const handleSliderChange = useCallback((axis: 'E_x' | 'E_y' | 'E_z', value: number) => {
    setLocalField((prev) => ({ ...prev, [axis]: value }));
  }, []);

  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      await apiSetElectricField(localField.E_x, localField.E_y, localField.E_z);
    } catch (e) {
      console.error('Failed to set electric field:', e);
    } finally {
      setTimeout(() => setIsApplying(false), 300);
    }
  }, [localField]);

  const handleReset = useCallback(async () => {
    setLocalField({ E_x: 0, E_y: 0, E_z: 0 });
    try {
      await apiSetElectricField(0, 0, 0);
    } catch (e) {
      console.error('Failed to reset electric field:', e);
    }
  }, []);

  const fieldMagnitude = Math.sqrt(
    localField.E_x ** 2 + localField.E_y ** 2 + localField.E_z ** 2
  );

  return (
    <div className="absolute top-4 left-4 z-10 w-72">
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h2 className="font-display text-lg font-bold text-white tracking-wider">
            虚拟电场
          </h2>
        </div>

        <div className="space-y-4">
          {(['E_x', 'E_y', 'E_z'] as const).map((axis, idx) => {
            const labels = ['X 轴', 'Y 轴', 'Z 轴'];
            const colors = ['text-red-400', 'text-green-400', 'text-blue-400'];
            return (
              <div key={axis} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${colors[idx]} font-medium`}>
                    {labels[idx]}
                  </span>
                  <span className="data-value text-cyber-cyan text-sm">
                    {localField[axis].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={localField[axis]}
                  onChange={(e) => handleSliderChange(axis, parseFloat(e.target.value))}
                  className="w-full h-2 bg-space-blue rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-cyber-cyan
                    [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,245,255,0.6)]
                    [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between bg-space-blue/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyber-purple" />
              <span className="text-xs text-gray-400">场强大小</span>
            </div>
            <span className="data-value text-cyber-purple text-sm font-bold">
              {fieldMagnitude.toFixed(2)}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={isApplying}
              className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm
                transition-all duration-200 flex items-center justify-center gap-2
                ${isApplying
                  ? 'bg-cyber-cyan/30 text-cyber-cyan cursor-wait'
                  : 'bg-cyber-cyan text-space-dark hover:bg-cyber-cyan/80 active:scale-95'}
              `}
            >
              <Zap className="w-4 h-4" />
              施加电场
            </button>
            <button
              onClick={handleReset}
              className="py-2 px-4 rounded-lg font-medium text-sm
                bg-space-blue/70 text-gray-300 hover:bg-space-blue
                transition-all duration-200 flex items-center justify-center gap-2
                active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              重置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
