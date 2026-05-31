import { useTwoQubitStore } from '@/store/twoQubitStore';
import { useShallow } from 'zustand/react/shallow';
import { densityMatrixAbs, formatComplexShort } from '@/utils/twoQubitMath';
import { complexAbsSq } from '@/utils/quantumMath';

const BASIS_LABELS = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];

function getHeatColor(value: number, maxVal: number): string {
  if (maxVal < 1e-10) return 'rgba(15, 23, 42, 1)';

  const ratio = value / maxVal;

  if (ratio < 0.25) {
    const t = ratio / 0.25;
    return `rgba(${Math.round(15 + t * 30)}, ${Math.round(23 + t * 40)}, ${Math.round(80 + t * 100)}, 1)`;
  } else if (ratio < 0.5) {
    const t = (ratio - 0.25) / 0.25;
    return `rgba(${Math.round(45 + t * 30)}, ${Math.round(63 + t * 120)}, ${Math.round(180 + t * 50)}, 1)`;
  } else if (ratio < 0.75) {
    const t = (ratio - 0.5) / 0.25;
    return `rgba(${Math.round(75 + t * 180)}, ${Math.round(183 - t * 30)}, ${Math.round(230 - t * 60)}, 1)`;
  } else {
    const t = (ratio - 0.75) / 0.25;
    return `rgba(${Math.round(255)}, ${Math.round(153 + t * 102)}, ${Math.round(170 - t * 120)}, 1)`;
  }
}

export function DensityMatrixHeatmap() {
  const { densityMatrix } = useTwoQubitStore(
    useShallow((state) => ({
      densityMatrix: state.state.densityMatrix
    }))
  );

  const absMatrix = densityMatrixAbs(densityMatrix);
  const maxVal = Math.max(...absMatrix.flat());

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
        密度矩阵 ρ
      </h3>

      <div className="text-xs text-gray-400 font-mono">
        ρ = |ψ⟩⟨ψ|
      </div>

      <div className="relative">
        <div className="flex">
          <div className="flex flex-col items-end pr-1 pt-7">
            {BASIS_LABELS.map((label, i) => (
              <div
                key={label}
                className="h-10 flex items-center text-xs text-gray-400 font-mono"
              >
                {label}
              </div>
            ))}
          </div>

          <div>
            <div className="flex pl-7">
              {BASIS_LABELS.map((label) => (
                <div
                  key={label}
                  className="w-10 text-center text-xs text-gray-400 font-mono"
                >
                  ⟨{label.slice(1)}
                </div>
              ))}
            </div>

            <div className="border border-gray-700/50 rounded">
              {densityMatrix.map((row, i) => (
                <div key={i} className="flex">
                  {row.map((cell, j) => {
                    const absVal = Math.sqrt(complexAbsSq(cell));
                    const bgColor = getHeatColor(absVal, maxVal);

                    return (
                      <div
                        key={j}
                        className="w-10 h-10 flex items-center justify-center border border-gray-800/30 text-xs font-mono"
                        style={{ backgroundColor: bgColor }}
                        title={`ρ[${i}][${j}] = ${formatComplexShort(cell)}`}
                      >
                        <span className="text-white/90 drop-shadow-sm">
                          {absVal < 0.001 ? '' : absVal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-gray-500">0</span>
        <div className="flex-1 h-3 rounded-full overflow-hidden">
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(to right, ${getHeatColor(0, 1)}, ${getHeatColor(0.25, 1)}, ${getHeatColor(0.5, 1)}, ${getHeatColor(0.75, 1)}, ${getHeatColor(1, 1)})`
            }}
          />
        </div>
        <span className="text-xs text-gray-500">|ρᵢⱼ|</span>
      </div>

      <div className="space-y-2 mt-3">
        <div className="text-xs text-gray-400">约化密度矩阵 ρ_A</div>
        <ReducedMatrixHeatmap which="A" />
      </div>

      <div className="space-y-2 mt-3">
        <div className="text-xs text-gray-400">约化密度矩阵 ρ_B</div>
        <ReducedMatrixHeatmap which="B" />
      </div>
    </div>
  );
}

function ReducedMatrixHeatmap({ which }: { which: 'A' | 'B' }) {
  const { reducedRhoA, reducedRhoB } = useTwoQubitStore(
    useShallow((state) => ({
      reducedRhoA: state.state.reducedRhoA,
      reducedRhoB: state.state.reducedRhoB
    }))
  );

  const rho = which === 'A' ? reducedRhoA : reducedRhoB;
  const labels = ['|0⟩', '|1⟩'];

  const absVals = rho.map(row => row.map(c => Math.sqrt(complexAbsSq(c))));
  const maxVal = Math.max(...absVals.flat(), 0.001);

  return (
    <div className="flex">
      <div className="flex flex-col items-end pr-1 pt-7">
        {labels.map((label) => (
          <div
            key={label}
            className="h-8 flex items-center text-xs text-gray-400 font-mono"
          >
            {label}
          </div>
        ))}
      </div>
      <div>
        <div className="flex pl-7">
          {labels.map((label) => (
            <div
              key={label}
              className="w-8 text-center text-xs text-gray-400 font-mono"
            >
              ⟨{label.slice(1)}
            </div>
          ))}
        </div>
        <div className="border border-gray-700/50 rounded">
          {rho.map((row, i) => (
            <div key={i} className="flex">
              {row.map((cell, j) => {
                const absVal = Math.sqrt(complexAbsSq(cell));
                const bgColor = getHeatColor(absVal, maxVal);
                return (
                  <div
                    key={j}
                    className="w-8 h-8 flex items-center justify-center border border-gray-800/30 text-xs font-mono"
                    style={{ backgroundColor: bgColor }}
                    title={formatComplexShort(cell)}
                  >
                    <span className="text-white/90 drop-shadow-sm">
                      {absVal < 0.001 ? '' : absVal.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
