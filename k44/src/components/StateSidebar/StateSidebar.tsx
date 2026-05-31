import { useQuantumStore } from '@/store/quantumStore';
import { useShallow } from 'zustand/react/shallow';
import { formatComplex } from '@/utils/quantumMath';
import { Info } from 'lucide-react';

export function StateSidebar() {
  const { alpha, beta, theta, phi, probability0, probability1 } = useQuantumStore(
    useShallow((state) => ({
      alpha: state.state.alpha,
      beta: state.state.beta,
      theta: state.state.theta,
      phi: state.state.phi,
      probability0: state.state.probability0,
      probability1: state.state.probability1
    }))
  );

  return (
    <div className="h-full p-4 space-y-6 overflow-y-auto">
      <div className="flex items-center gap-2 text-cyan-400">
        <Info className="w-5 h-5" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">
          量子态信息
        </h3>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="text-xs text-gray-400 mb-2">态矢量 |ψ⟩</div>
          <div className="font-mono text-lg text-cyan-400">
            |ψ⟩ = α|0⟩ + β|1⟩
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-3 bg-gray-800/30 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">α 振幅</span>
              <span className="text-xs text-cyan-500 font-mono">|0⟩</span>
            </div>
            <div className="font-mono text-sm text-white">
              {formatComplex(alpha)}
            </div>
          </div>

          <div className="p-3 bg-gray-800/30 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">β 振幅</span>
              <span className="text-xs text-orange-500 font-mono">|1⟩</span>
            </div>
            <div className="font-mono text-sm text-white">
              {formatComplex(beta)}
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="text-xs text-gray-400 mb-3">布洛赫球坐标</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-300">θ (极角)</span>
              <span className="font-mono text-sm text-white">
                {(theta / Math.PI).toFixed(3)}π
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-300">φ (方位角)</span>
              <span className="font-mono text-sm text-white">
                {(phi / Math.PI).toFixed(3)}π
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="text-xs text-gray-400 mb-3">测量概率</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-cyan-400 font-mono">P(|0⟩)</span>
              <span className="font-mono text-sm text-white">
                {(probability0 * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-orange-400 font-mono">P(|1⟩)</span>
              <span className="font-mono text-sm text-white">
                {(probability1 * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-800/30 rounded-lg">
          <div className="text-xs text-gray-400 mb-3">坐标轴说明</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-gray-300">X轴</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-300">Y轴</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
              <span className="text-gray-300">Z轴</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
              <span className="text-gray-300 text-sm">量子态向量</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
