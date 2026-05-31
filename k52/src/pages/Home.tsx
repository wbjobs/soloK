import { useState } from 'react';
import { Cpu, Layers, Eye, ChevronLeft, ChevronRight, Zap, PlaySquare } from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import { AlgorithmSelector } from '@/components/AlgorithmSelector';
import { ParameterSliders } from '@/components/ParameterSliders';
import PreviewCanvas from '@/components/PreviewCanvas';
import HistoryPanel from '@/components/HistoryPanel';
import PerformancePanel from '@/components/PerformancePanel';
import ExportPanel from '@/components/ExportPanel';
import BatchProcessor from '@/components/BatchProcessor';
import { useAppStore } from '@/store/useAppStore';

type RightTab = 'performance' | 'history';

export default function Home() {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('performance');
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { compareMode, setCompareMode, batch, setBatchMode } = useAppStore();

  if (batch.isBatchMode) {
    return (
      <div className="grid-bg relative flex h-screen w-screen flex-col overflow-hidden bg-deep-space">
        <header className="flex items-center justify-between border-b border-purple-500/20 bg-deep-space/80 px-6 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-purple/20">
              <Layers className="h-5 w-5 text-neon-purple" />
            </div>
            <div>
              <h1 className="glow-text text-lg font-bold text-white">
                Edge<span className="text-neon-purple">Detect</span>
              </h1>
              <p className="text-xs text-slate-500">算法批处理模式</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-3 py-1.5">
              <Zap className="h-3.5 w-3.5 text-neon-purple" />
              <span className="text-xs font-mono text-slate-300">多图处理</span>
            </div>
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden p-4">
          <div className="flex-1 overflow-hidden rounded-xl">
            <BatchProcessor />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-bg relative flex h-screen w-screen flex-col overflow-hidden bg-deep-space">
      <header className="flex items-center justify-between border-b border-cyan-500/10 bg-deep-space/80 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-cyan/10">
            <Cpu className="h-5 w-5 text-neon-cyan" />
          </div>
          <div>
            <h1 className="glow-text text-lg font-bold text-white">
              Edge<span className="text-neon-cyan">Detect</span>
            </h1>
            <p className="text-xs text-slate-500">WebGL 加速边缘检测工具</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBatchMode(true)}
            className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 transition-all hover:bg-purple-500/20"
          >
            <PlaySquare className="h-3.5 w-3.5" />
            批处理模式
          </button>
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              compareMode
                ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan shadow-neon-sm'
                : 'border-slate-600 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            对比模式
          </button>
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-3 py-1.5">
            <Zap className="h-3.5 w-3.5 text-neon-cyan" />
            <span className="text-xs font-mono text-slate-300">WebGL2</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`flex flex-col border-r border-cyan-500/10 bg-deep-space-light/50 backdrop-blur-sm transition-all duration-300 ${
            leftCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-80 min-w-[320px]'
          }`}
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <ImageUploader />
            <AlgorithmSelector />
            <ParameterSliders />
            <ExportPanel />
          </div>
        </aside>

        <button
          onClick={() => setLeftCollapsed(!leftCollapsed)}
          className="z-10 flex w-5 items-center justify-center border-y border-cyan-500/10 bg-deep-space/80 text-slate-400 transition-colors hover:text-neon-cyan"
        >
          {leftCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        <main className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="flex-1 overflow-hidden rounded-xl">
            <PreviewCanvas />
          </div>
        </main>

        <button
          onClick={() => setRightCollapsed(!rightCollapsed)}
          className="z-10 flex w-5 items-center justify-center border-y border-cyan-500/10 bg-deep-space/80 text-slate-400 transition-colors hover:text-neon-cyan"
        >
          {rightCollapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        <aside
          className={`flex flex-col border-l border-cyan-500/10 bg-deep-space-light/50 backdrop-blur-sm transition-all duration-300 ${
            rightCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-80 min-w-[320px]'
          }`}
        >
          <div className="flex border-b border-cyan-500/10">
            <button
              onClick={() => setRightTab('performance')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                rightTab === 'performance'
                  ? 'border-b-2 border-neon-cyan text-neon-cyan bg-neon-cyan/5'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Cpu className="h-4 w-4" />
              性能
            </button>
            <button
              onClick={() => setRightTab('history')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                rightTab === 'history'
                  ? 'border-b-2 border-neon-purple text-neon-purple bg-neon-purple/5'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Layers className="h-4 w-4" />
              历史
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {rightTab === 'performance' ? <PerformancePanel /> : <HistoryPanel />}
          </div>
        </aside>
      </div>
    </div>
  );
}
