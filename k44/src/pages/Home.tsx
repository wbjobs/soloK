import { useState } from 'react';
import { BlochSphereScene } from '@/components/BlochSphere/BlochSphereScene';
import { DualBlochSphereScene } from '@/components/BlochSphere/DualBlochSphereScene';
import { AngleControl } from '@/components/ControlPanel/AngleControl';
import { PauliGates } from '@/components/ControlPanel/PauliGates';
import { MeasurementPanel } from '@/components/ControlPanel/MeasurementPanel';
import { StateSidebar } from '@/components/StateSidebar/StateSidebar';
import { BellStateSelector } from '@/components/ControlPanel/BellStateSelector';
import { DensityMatrixHeatmap } from '@/components/ControlPanel/DensityMatrixHeatmap';
import { useTwoQubitStore } from '@/store/twoQubitStore';
import { Atom, Link2 } from 'lucide-react';

type ViewMode = 'single' | 'dual';

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('single');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20">
              <Atom className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                布洛赫球面模拟器
              </h1>
              <p className="text-sm text-gray-400">
                量子比特可视化交互工具
              </p>
            </div>
          </div>

          <div className="flex bg-gray-800/50 rounded-lg p-1 border border-gray-700/50">
            <button
              onClick={() => setViewMode('single')}
              className={`
                px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                flex items-center gap-2
                ${viewMode === 'single'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-sm'
                  : 'text-gray-400 hover:text-gray-300'}
              `}
            >
              <Atom className="w-4 h-4" />
              单量子比特
            </button>
            <button
              onClick={() => setViewMode('dual')}
              className={`
                px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                flex items-center gap-2
                ${viewMode === 'dual'
                  ? 'bg-pink-500/20 text-pink-400 shadow-sm'
                  : 'text-gray-400 hover:text-gray-300'}
              `}
            >
              <Link2 className="w-4 h-4" />
              纠缠态
            </button>
          </div>
        </div>
      </header>

      {viewMode === 'single' ? <SingleQubitView /> : <DualQubitView />}
    </div>
  );
}

function SingleQubitView() {
  return (
    <main className="flex-1 flex overflow-hidden">
      <aside className="w-72 border-r border-white/10 flex flex-col overflow-hidden">
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          <div className="glass-panel rounded-xl p-4">
            <AngleControl />
          </div>
          <div className="glass-panel rounded-xl p-4">
            <PauliGates />
          </div>
          <div className="glass-panel rounded-xl p-4">
            <MeasurementPanel />
          </div>
        </div>
      </aside>

      <section className="flex-1 relative">
        <BlochSphereScene />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
          <p className="text-sm text-gray-400">
            拖拽旋转 · 滚轮缩放 · 右键平移
          </p>
        </div>
      </section>

      <aside className="w-64 border-l border-white/10 glass-panel">
        <StateSidebar />
      </aside>
    </main>
  );
}

function DualQubitView() {
  return (
    <main className="flex-1 flex overflow-hidden">
      <aside className="w-72 border-r border-white/10 flex flex-col overflow-hidden">
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          <div className="glass-panel rounded-xl p-4">
            <BellStateSelector />
          </div>
          <div className="glass-panel rounded-xl p-4">
            <DensityMatrixHeatmap />
          </div>
        </div>
      </aside>

      <section className="flex-1 relative">
        <DualBlochSphereScene />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
          <p className="text-sm text-gray-400">
            双球面 · 虚线表示纠缠关联 · 拖拽旋转 · 滚轮缩放
          </p>
        </div>
        <div className="absolute top-4 left-4 flex gap-4 text-xs">
          <div className="flex items-center gap-1.5 glass-panel rounded-lg px-3 py-1.5">
            <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
            <span className="text-gray-300">Qubit A</span>
          </div>
          <div className="flex items-center gap-1.5 glass-panel rounded-lg px-3 py-1.5">
            <div className="w-3 h-3 rounded-full bg-pink-400"></div>
            <span className="text-gray-300">Qubit B</span>
          </div>
          <div className="flex items-center gap-1.5 glass-panel rounded-lg px-3 py-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-400/50"></div>
            <span className="text-gray-300">完全混合态</span>
          </div>
        </div>
      </section>

      <aside className="w-72 border-l border-white/10 glass-panel overflow-y-auto">
        <DualQubitInfoSidebar />
      </aside>
    </main>
  );
}

function DualQubitInfoSidebar() {
  const { amplitudes, densityMatrix, blochVectorA, blochVectorB, bellType, concurrence } =
    useTwoQubitStore(
      (state) => ({
        amplitudes: state.state.amplitudes,
        densityMatrix: state.state.densityMatrix,
        blochVectorA: state.state.blochVectorA,
        blochVectorB: state.state.blochVectorB,
        bellType: state.state.bellType,
        concurrence: state.state.concurrence
      })
    );

  const BELL_NAMES: Record<string, string> = {
    PhiPlus: '|Φ⁺⟩ = (|00⟩+|11⟩)/√2',
    PhiMinus: '|Φ⁻⟩ = (|00⟩-|11⟩)/√2',
    PsiPlus: '|Ψ⁺⟩ = (|01⟩+|10⟩)/√2',
    PsiMinus: '|Ψ⁻⟩ = (|01⟩-|10⟩)/√2'
  };

  const basisLabels = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];

  return (
    <div className="h-full p-4 space-y-5 overflow-y-auto">
      <div className="flex items-center gap-2 text-pink-400">
        <Link2 className="w-5 h-5" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">
          纠缠态信息
        </h3>
      </div>

      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="text-xs text-gray-400 mb-2">Bell态</div>
        <div className="font-mono text-base text-pink-400">
          {BELL_NAMES[bellType]}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs text-gray-400">态矢量振幅</div>
        {amplitudes.map((amp, i) => (
          <div key={i} className="p-2 bg-gray-800/30 rounded flex justify-between items-center">
            <span className="text-xs text-gray-400 font-mono">{basisLabels[i]}</span>
            <span className="font-mono text-sm text-white">
              {formatAmp(amp)}
            </span>
          </div>
        ))}
      </div>

      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="text-xs text-gray-400 mb-3">Bloch向量</div>
        <div className="space-y-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
              <span className="text-xs text-cyan-400">Qubit A</span>
            </div>
            <div className="font-mono text-sm text-gray-300">
              ({blochVectorA.x.toFixed(2)}, {blochVectorA.y.toFixed(2)}, {blochVectorA.z.toFixed(2)})
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {blochVectorLength(blochVectorA) < 0.01
                ? '完全混合态 (I/2)'
                : `纯度: ${blochVectorLength(blochVectorA).toFixed(3)}`}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-pink-400"></div>
              <span className="text-xs text-pink-400">Qubit B</span>
            </div>
            <div className="font-mono text-sm text-gray-300">
              ({blochVectorB.x.toFixed(2)}, {blochVectorB.y.toFixed(2)}, {blochVectorB.z.toFixed(2)})
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {blochVectorLength(blochVectorB) < 0.01
                ? '完全混合态 (I/2)'
                : `纯度: ${blochVectorLength(blochVectorB).toFixed(3)}`}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="text-xs text-gray-400 mb-2">Tr(ρ²) 纯度检验</div>
        <div className="font-mono text-sm text-white">
          {computePurity(densityMatrix).toFixed(4)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {computePurity(densityMatrix) > 0.99 ? '纯态' : '混合态'}
        </div>
      </div>

      <div className="p-4 bg-gray-800/50 rounded-lg border border-pink-500/30">
        <div className="text-xs text-gray-400 mb-2">纠缠度</div>
        <div className="text-2xl font-bold text-pink-400 font-mono">
          {concurrence.toFixed(4)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          C = 1 为最大纠缠
        </div>
      </div>
    </div>
  );
}

function formatAmp(c: { re: number; im: number }): string {
  const re = c.re;
  const im = c.im;
  if (Math.abs(re) < 1e-6 && Math.abs(im) < 1e-6) return '0';
  if (Math.abs(im) < 1e-6) return re.toFixed(3);
  if (Math.abs(re) < 1e-6) return `${im >= 0 ? '' : '-'}${Math.abs(im).toFixed(3)}i`;
  return `${re.toFixed(3)}${im >= 0 ? '+' : '-'}${Math.abs(im).toFixed(3)}i`;
}

function blochVectorLength(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
}

function computePurity(rho: { re: number; im: number }[][]): number {
  let trace = 0;
  for (let i = 0; i < rho.length; i++) {
    let sum = { re: 0, im: 0 };
    for (let k = 0; k < rho[i].length; k++) {
      const a = rho[i][k];
      const b = rho[k][i];
      sum.re += a.re * b.re - a.im * b.im;
      sum.im += a.re * b.im + a.im * b.re;
    }
    trace += sum.re;
  }
  return trace;
}
