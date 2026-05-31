import { useQuantumStore } from '@/store/quantumStore';
import { useShallow } from 'zustand/react/shallow';
import { Zap } from 'lucide-react';

export function MeasurementPanel() {
  const { probability0, probability1, measurementResult, performMeasurement } = useQuantumStore(
    useShallow((state) => ({
      probability0: state.state.probability0,
      probability1: state.state.probability1,
      measurementResult: state.measurementResult,
      performMeasurement: state.performMeasurement
    }))
  );

  const p0 = (probability0 * 100).toFixed(1);
  const p1 = (probability1 * 100).toFixed(1);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
        量子测量
      </h3>

      <button
        onClick={performMeasurement}
        className="
          w-full py-3 px-4 rounded-lg
          bg-gradient-to-r from-cyan-500/20 to-blue-500/20
          border-2 border-cyan-500/50
          text-cyan-400 font-semibold text-lg
          hover:from-cyan-500/30 hover:to-blue-500/30
          hover:border-cyan-400
          hover:shadow-lg hover:shadow-cyan-500/20
          transition-all duration-200
          active:scale-98
          flex items-center justify-center gap-2
        "
      >
        <Zap className="w-5 h-5" />
        测量量子态
      </button>

      {measurementResult !== null && (
        <div className={`
          p-4 rounded-lg text-center
          ${measurementResult === '0'
            ? 'bg-cyan-500/20 border border-cyan-500/50'
            : 'bg-orange-500/20 border border-orange-500/50'}
          animate-pulse
        `}>
          <div className="text-sm text-gray-400 mb-1">测量结果</div>
          <div className={`
            text-4xl font-bold font-mono
            ${measurementResult === '0' ? 'text-cyan-400' : 'text-orange-400'}
          `}>
            |{measurementResult}⟩
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="text-sm text-gray-400 font-medium">概率分布</div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-cyan-400 font-mono">|0⟩</span>
              <span className="text-gray-400 font-mono">{p0}%</span>
            </div>
            <div className="h-6 bg-gray-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${p0}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-orange-400 font-mono">|1⟩</span>
              <span className="text-gray-400 font-mono">{p1}%</span>
            </div>
            <div className="h-6 bg-gray-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-500"
                style={{ width: `${p1}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
