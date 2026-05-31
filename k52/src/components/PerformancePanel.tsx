import { useEffect, useRef } from 'react';
import { Activity, Cpu, Gauge, BarChart3 } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import { useAppStore } from '@/store/useAppStore';
import { ALGORITHM_INFO, type Algorithm } from '@/types';

Chart.register(...registerables);

export default function PerformancePanel() {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const { performance: perf } = useAppStore();

  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Sobel', 'Canny', 'Laplacian'],
        datasets: [{
          label: '处理耗时 (ms)',
          data: [
            perf.processTime.sobel || 0,
            perf.processTime.canny || 0,
            perf.processTime.laplacian || 0,
          ],
          backgroundColor: [
            'rgba(6, 182, 212, 0.6)',
            'rgba(139, 92, 246, 0.6)',
            'rgba(34, 197, 94, 0.6)',
          ],
          borderColor: [
            'rgba(6, 182, 212, 1)',
            'rgba(139, 92, 246, 1)',
            'rgba(34, 197, 94, 1)',
          ],
          borderWidth: 2,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#E2E8F0',
            bodyColor: '#06B6D4',
            borderColor: 'rgba(6, 182, 212, 0.3)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (context) => `${context.parsed.y.toFixed(2)} ms`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#94A3B8', font: { size: 11, family: 'Inter' } },
            grid: { color: 'rgba(51, 65, 85, 0.3)' },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#94A3B8',
              font: { size: 11, family: 'JetBrains Mono' },
              callback: (value) => `${value}ms`,
            },
            grid: { color: 'rgba(51, 65, 85, 0.3)' },
          },
        },
        animation: { duration: 300, easing: 'easeOutQuart' },
      },
    });

    return () => {
      chartInstanceRef.current?.destroy();
      chartInstanceRef.current = null;
    };
  }, [perf.processTime]);

  const fpsColor = perf.fps >= 55 ? 'text-green-400' : perf.fps >= 30 ? 'text-yellow-400' : 'text-red-400';
  const fpsBarWidth = Math.min((perf.fps / 60) * 100, 100);

  const memColor = perf.gpuMemoryMB <= 50 ? 'text-green-400' : perf.gpuMemoryMB <= 100 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-neon-cyan" />
        <h3 className="text-lg font-medium text-slate-200">性能监控</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neon-cyan/20 bg-slate-800/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="h-4 w-4 text-neon-cyan" />
            <span className="text-xs text-slate-400">FPS</span>
          </div>
          <div className={`text-2xl font-bold font-mono ${fpsColor}`}>
            {Math.round(perf.fps)}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                perf.fps >= 55 ? 'bg-green-400' : perf.fps >= 30 ? 'bg-yellow-400' : 'bg-red-400'
              }`}
              style={{ width: `${fpsBarWidth}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>0</span>
            <span>60</span>
          </div>
        </div>

        <div className="rounded-xl border border-neon-purple/20 bg-slate-800/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-4 w-4 text-neon-purple" />
            <span className="text-xs text-slate-400">GPU 内存</span>
          </div>
          <div className={`text-2xl font-bold font-mono ${memColor}`}>
            {perf.gpuMemoryMB.toFixed(1)}
          </div>
          <div className="mt-1 text-xs text-slate-500">MB</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-neon-cyan" />
          <span className="text-sm text-slate-300">算法耗时对比</span>
        </div>
        <div className="h-44">
          <canvas ref={chartRef} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
        <div className="mb-2 text-xs text-slate-400">当前处理耗时</div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold font-mono text-neon-cyan">
            {perf.currentProcessTime.toFixed(2)}
          </span>
          <span className="text-sm text-slate-400">ms</span>
        </div>
        <div className="mt-2 space-y-1.5">
          {(['sobel', 'canny', 'laplacian'] as Algorithm[]).map((algo) => (
            <div key={algo} className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{ALGORITHM_INFO[algo].name}</span>
              <span className="font-mono text-slate-300">
                {perf.processTime[algo] ? `${perf.processTime[algo].toFixed(2)}ms` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
