import { useQuantumStore } from '@/store/quantumStore';
import { useShallow } from 'zustand/react/shallow';
import { PauliGate } from '@/types/quantum';

const gateConfig: Record<PauliGate, { label: string; color: string; desc: string }> = {
  X: { label: 'X', color: 'red', desc: '比特翻转' },
  Y: { label: 'Y', color: 'green', desc: 'Y轴旋转' },
  Z: { label: 'Z', color: 'purple', desc: '相位翻转' }
};

const colorClasses = {
  red: {
    base: 'bg-red-500/20 border-red-500/50 text-red-400',
    hover: 'hover:bg-red-500/30 hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
    active: 'active:bg-red-500/40'
  },
  green: {
    base: 'bg-green-500/20 border-green-500/50 text-green-400',
    hover: 'hover:bg-green-500/30 hover:border-green-400 hover:shadow-lg hover:shadow-green-500/20',
    active: 'active:bg-green-500/40'
  },
  purple: {
    base: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
    hover: 'hover:bg-purple-500/30 hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/20',
    active: 'active:bg-purple-500/40'
  }
};

export function PauliGates() {
  const { applyPauliGate, resetState } = useQuantumStore(
    useShallow((state) => ({
      applyPauliGate: state.applyPauliGate,
      resetState: state.resetState
    }))
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
        泡利量子门
      </h3>

      <div className="grid grid-cols-3 gap-2">
        {(['X', 'Y', 'Z'] as PauliGate[]).map((gate) => {
          const config = gateConfig[gate];
          const colors = colorClasses[config.color as keyof typeof colorClasses];

          return (
            <button
              key={gate}
              onClick={() => applyPauliGate(gate)}
              className={`
                relative p-3 rounded-lg border-2 font-mono text-xl font-bold
                transition-all duration-200 transform
                ${colors.base} ${colors.hover} ${colors.active}
                active:scale-95
              `}
            >
              <div className="flex flex-col items-center">
                <span className="text-2xl">{config.label}</span>
                <span className="text-xs mt-1 opacity-70">{config.desc}</span>
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={resetState}
        className="
          w-full py-2 px-4 rounded-lg
          bg-gray-700/50 border border-gray-600
          text-gray-300 text-sm font-medium
          hover:bg-gray-600/50 hover:border-gray-500
          transition-all duration-200
        "
      >
        重置到 |0⟩
      </button>
    </div>
  );
}
