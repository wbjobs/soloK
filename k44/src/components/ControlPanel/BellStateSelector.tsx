import { useTwoQubitStore } from '@/store/twoQubitStore';
import { useShallow } from 'zustand/react/shallow';
import { BellStateType } from '@/types/quantum';
import { BELL_STATES } from '@/utils/twoQubitMath';

const bellOptions: { type: BellStateType; label: string; desc: string }[] = [
  { type: 'PhiPlus', label: 'Φ⁺', desc: '(|00⟩+|11⟩)/√2' },
  { type: 'PhiMinus', label: 'Φ⁻', desc: '(|00⟩-|11⟩)/√2' },
  { type: 'PsiPlus', label: 'Ψ⁺', desc: '(|01⟩+|10⟩)/√2' },
  { type: 'PsiMinus', label: 'Ψ⁻', desc: '(|01⟩-|10⟩)/√2' }
];

const bellColors: Record<BellStateType, string> = {
  PhiPlus: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-400',
  PhiMinus: 'border-blue-400/50 bg-blue-500/15 text-blue-400',
  PsiPlus: 'border-pink-400/50 bg-pink-500/15 text-pink-400',
  PsiMinus: 'border-purple-400/50 bg-purple-500/15 text-purple-400'
};

const bellActiveColors: Record<BellStateType, string> = {
  PhiPlus: 'border-cyan-400 bg-cyan-500/25 shadow-lg shadow-cyan-500/20 text-cyan-300',
  PhiMinus: 'border-blue-400 bg-blue-500/25 shadow-lg shadow-blue-500/20 text-blue-300',
  PsiPlus: 'border-pink-400 bg-pink-500/25 shadow-lg shadow-pink-500/20 text-pink-300',
  PsiMinus: 'border-purple-400 bg-purple-500/25 shadow-lg shadow-purple-500/20 text-purple-300'
};

export function BellStateSelector() {
  const { bellType, setBellType, concurrence } = useTwoQubitStore(
    useShallow((state) => ({
      bellType: state.bellType,
      setBellType: state.setBellType,
      concurrence: state.state.concurrence
    }))
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
        Bell态选择
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {bellOptions.map(({ type, label, desc }) => {
          const isActive = bellType === type;
          return (
            <button
              key={type}
              onClick={() => setBellType(type)}
              className={`
                p-3 rounded-lg border-2 transition-all duration-200
                ${isActive ? bellActiveColors[type] : bellColors[type]}
                active:scale-95
              `}
            >
              <div className="text-2xl font-bold font-mono">{label}</div>
              <div className="text-xs mt-1 opacity-70 font-mono">{desc}</div>
            </button>
          );
        })}
      </div>

      <div className="p-3 bg-gray-800/30 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">纠缠度 (Concurrence)</span>
          <span className="text-lg font-bold text-pink-400 font-mono">
            {concurrence.toFixed(3)}
          </span>
        </div>
        <div className="mt-2 h-2 bg-gray-700/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${concurrence * 100}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {concurrence > 0.99 ? '最大纠缠态' : concurrence > 0.5 ? '部分纠缠' : '可分态'}
        </div>
      </div>

      <div className="p-3 bg-gray-800/30 rounded-lg">
        <div className="text-xs text-gray-400 mb-2">当前态</div>
        <div className="font-mono text-lg text-white">
          {BELL_STATES[bellType].symbol}
        </div>
        <div className="font-mono text-sm text-gray-400 mt-1">
          = {BELL_STATES[bellType].latex}
        </div>
      </div>

      <div className="p-3 bg-gray-800/30 rounded-lg">
        <div className="text-xs text-gray-400 mb-2">纠缠关联</div>
        <div className="text-sm text-gray-300 space-y-1">
          {bellType === 'PhiPlus' || bellType === 'PhiMinus' ? (
            <>
              <div>测量A=|0⟩ → B坍缩到|0⟩</div>
              <div>测量A=|1⟩ → B坍缩到|1⟩</div>
            </>
          ) : (
            <>
              <div>测量A=|0⟩ → B坍缩到|1⟩</div>
              <div>测量A=|1⟩ → B坍缩到|0⟩</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
