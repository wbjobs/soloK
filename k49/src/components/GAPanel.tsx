import { useEffect, useRef } from 'react';
import { useSimStore } from '@/store/useSimStore';
import { createGASearchWorker, genomeToCells } from '@/workers/gaSearch';
import { GATargetType } from '@/workers/gaSearch';
import { Play, Pause, RotateCcw, Trash2, Download, ChevronDown, ChevronUp, Dna } from 'lucide-react';

const TARGET_OPTIONS: { value: GATargetType; label: string; desc: string }[] = [
    { value: 'oscillator', label: '振荡器', desc: '寻找周期性重复模式' },
    { value: 'custom_period', label: '指定周期', desc: '寻找指定周期的振荡器' },
    { value: 'stable', label: '稳定态', desc: '寻找演化后静止不变的模式' },
    { value: 'glider', label: '滑行态', desc: '寻找整体位移运动的模式' },
    { value: 'chaos', label: '混沌态', desc: '寻找长时间无规律演化的模式' },
    { value: 'max_lifetime', label: '最长存活', desc: '寻找存活时间最长的初始配置' },
];

const MODE_COLORS: Record<string, string> = {
    stable: 'text-emerald-400',
    oscillator: 'text-blue-400',
    glider: 'text-orange-400',
    chaos: 'text-red-400',
    unknown: 'text-zinc-400',
};

export default function GAPanel() {
    const workerRef = useRef<Worker | null>(null);
    const {
        gaExpanded,
        gaConfig,
        gaProgress,
        gaBestIndividuals,
        toggleGAExpanded,
        setGAConfig,
        setGAProgress,
        setGAResult,
        addGABestIndividual,
        clearGAResults,
        resetGAConfig,
    } = useSimStore();

    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'stop' });
                workerRef.current.terminate();
            }
        };
    }, []);

    const startSearch = () => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'stop' });
            workerRef.current.terminate();
        }

        const worker = createGASearchWorker();
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent) => {
            const { type, ...data } = e.data;
            if (type === 'progress') {
                setGAProgress(data);
                if (data.bestIndividual && data.bestIndividual.fitness > 0.7) {
                    const cells = genomeToCells(data.bestIndividual.genome, gaConfig.searchRegionSize);
                    addGABestIndividual(data.bestIndividual, cells);
                }
            } else if (type === 'complete') {
                setGAProgress({ isSearching: false });
                setGAResult(data);
                if (data.bestIndividual) {
                    const cells = genomeToCells(data.bestIndividual.genome, gaConfig.searchRegionSize);
                    addGABestIndividual(data.bestIndividual, cells);
                }
            } else if (type === 'stopped') {
                setGAProgress({ isSearching: false });
            }
        };

        setGAProgress({
            isSearching: true,
            generation: 0,
            bestFitness: 0,
            avgFitness: 0,
            history: [],
        });

        worker.postMessage({ type: 'start', config: gaConfig });
    };

    const stopSearch = () => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'stop' });
        }
    };

    const applyIndividual = (cells: [number, number][]) => {
        const sim = (window as any).__golSimulator;
        if (sim) {
            sim.reset();
            sim.setCells(cells, true);
        }
    };

    const exportGenome = (genome: Uint8Array) => {
        const blob = new Blob([genome], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gol-genome-${Date.now()}.bin`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="border-t border-white/5 pt-3">
            <button
                onClick={toggleGAExpanded}
                className="w-full flex items-center justify-between text-left mb-2"
            >
                <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                    <Dna size={12} className="text-purple-400" />
                    遗传算法搜索
                </h3>
                {gaExpanded ? <ChevronUp size={12} className="text-zinc-500" /> : <ChevronDown size={12} className="text-zinc-500" />}
            </button>

            {gaExpanded && (
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">目标模式</label>
                        <select
                            value={gaConfig.targetType}
                            onChange={(e) => setGAConfig({ targetType: e.target.value as GATargetType })}
                            disabled={gaProgress.isSearching}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none focus:border-purple-400/50 disabled:opacity-50"
                        >
                            {TARGET_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
                            ))}
                        </select>
                    </div>

                    {gaConfig.targetType === 'custom_period' && (
                        <div>
                            <label className="text-[10px] text-zinc-500 block mb-1">
                                目标周期: <span className="text-purple-400">{gaConfig.targetPeriod}</span>
                            </label>
                            <input
                                type="range"
                                min={2}
                                max={120}
                                value={gaConfig.targetPeriod}
                                onChange={(e) => setGAConfig({ targetPeriod: Number(e.target.value) })}
                                disabled={gaProgress.isSearching}
                                className="w-full accent-purple-400 h-1"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-zinc-500 block mb-1">
                                搜索区域: {gaConfig.searchRegionSize}²
                            </label>
                            <input
                                type="range"
                                min={16}
                                max={64}
                                step={8}
                                value={gaConfig.searchRegionSize}
                                onChange={(e) => setGAConfig({ searchRegionSize: Number(e.target.value) })}
                                disabled={gaProgress.isSearching}
                                className="w-full accent-purple-400 h-1"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-zinc-500 block mb-1">
                                种群大小: {gaConfig.populationSize}
                            </label>
                            <input
                                type="range"
                                min={20}
                                max={100}
                                step={10}
                                value={gaConfig.populationSize}
                                onChange={(e) => setGAConfig({ populationSize: Number(e.target.value) })}
                                disabled={gaProgress.isSearching}
                                className="w-full accent-purple-400 h-1"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-zinc-500 block mb-1">
                                变异率: {(gaConfig.mutationRate * 100).toFixed(1)}%
                            </label>
                            <input
                                type="range"
                                min={0.1}
                                max={5}
                                step={0.1}
                                value={gaConfig.mutationRate * 100}
                                onChange={(e) => setGAConfig({ mutationRate: Number(e.target.value) / 100 })}
                                disabled={gaProgress.isSearching}
                                className="w-full accent-purple-400 h-1"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-zinc-500 block mb-1">
                                评估步数: {gaConfig.evaluationSteps}
                            </label>
                            <input
                                type="range"
                                min={50}
                                max={500}
                                step={50}
                                value={gaConfig.evaluationSteps}
                                onChange={(e) => setGAConfig({ evaluationSteps: Number(e.target.value) })}
                                disabled={gaProgress.isSearching}
                                className="w-full accent-purple-400 h-1"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {gaProgress.isSearching ? (
                            <button
                                onClick={stopSearch}
                                className="glass-btn text-xs py-1.5 flex items-center justify-center gap-1 text-red-400 border-red-400/30 hover:bg-red-400/10"
                            >
                                <Pause size={12} /> 停止
                            </button>
                        ) : (
                            <button
                                onClick={startSearch}
                                className="glass-btn text-xs py-1.5 flex items-center justify-center gap-1 text-purple-400 border-purple-400/30 hover:bg-purple-400/10"
                            >
                                <Play size={12} /> 开始搜索
                            </button>
                        )}
                        <div className="grid grid-cols-2 gap-1">
                            <button
                                onClick={resetGAConfig}
                                disabled={gaProgress.isSearching}
                                className="glass-btn text-xs py-1.5 flex items-center justify-center disabled:opacity-40"
                                title="重置参数"
                            >
                                <RotateCcw size={12} />
                            </button>
                            <button
                                onClick={clearGAResults}
                                disabled={gaProgress.isSearching}
                                className="glass-btn text-xs py-1.5 flex items-center justify-center disabled:opacity-40"
                                title="清除结果"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>

                    {gaProgress.isSearching && (
                        <div className="bg-white/[0.03] rounded-lg p-2 border border-purple-500/20">
                            <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-zinc-500">世代</span>
                                <span className="text-purple-400 font-mono">{gaProgress.generation} / {gaConfig.maxGenerations}</span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1 mb-2">
                                <div
                                    className="bg-gradient-to-r from-purple-500 to-cyan-400 h-1 rounded-full transition-all duration-300"
                                    style={{ width: `${(gaProgress.generation / gaConfig.maxGenerations) * 100}%` }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div>
                                    <span className="text-zinc-500">最佳适应度: </span>
                                    <span className="text-cyan-400 font-mono">{(gaProgress.bestFitness * 100).toFixed(1)}%</span>
                                </div>
                                <div>
                                    <span className="text-zinc-500">平均适应度: </span>
                                    <span className="text-zinc-300 font-mono">{(gaProgress.avgFitness * 100).toFixed(1)}%</span>
                                </div>
                            </div>
                            {gaProgress.bestIndividual && (
                                <div className="mt-2 pt-2 border-t border-white/5 text-[10px]">
                                    <span className="text-zinc-500">当前最佳: </span>
                                    <span className={MODE_COLORS[gaProgress.bestIndividual.resultMode]}>
                                        {gaProgress.bestIndividual.resultMode}
                                    </span>
                                    {gaProgress.bestIndividual.resultPeriod && (
                                        <span className="text-zinc-400 ml-1">周期 {gaProgress.bestIndividual.resultPeriod}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {!gaProgress.isSearching && gaProgress.history.length > 0 && (
                        <div className="bg-white/[0.03] rounded-lg p-2 border border-zinc-700/30">
                            <div className="text-[10px] text-zinc-500 mb-1">进化曲线 (最近20代)</div>
                            <FitnessChart history={gaProgress.history.slice(-20)} />
                        </div>
                    )}

                    {gaBestIndividuals.length > 0 && (
                        <div>
                            <div className="text-[10px] text-zinc-500 mb-1 flex items-center justify-between">
                                <span>最佳结果 ({gaBestIndividuals.length})</span>
                            </div>
                            <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                                {gaBestIndividuals.map((ind, idx) => (
                                    <div
                                        key={idx}
                                        className="bg-white/[0.02] rounded-lg p-2 border border-white/5 hover:border-purple-400/30 transition-colors group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-zinc-600 font-mono w-4">#{idx + 1}</span>
                                                <span className={`text-xs font-bold ${MODE_COLORS[ind.resultMode]}`}>
                                                    {ind.resultMode}
                                                </span>
                                                {ind.resultPeriod && (
                                                    <span className="text-[10px] text-zinc-500">P={ind.resultPeriod}</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-cyan-400 font-mono">
                                                {(ind.fitness * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-500">
                                            <span>🧬 {ind.resultCells}细胞</span>
                                            <span>·</span>
                                            <span>⏱ {ind.resultLifetime}步</span>
                                        </div>
                                        <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => applyIndividual(ind.cells)}
                                                className="flex-1 glass-btn text-[9px] py-1 text-cyan-400 border-cyan-400/20 hover:bg-cyan-400/10"
                                            >
                                                应用到画布
                                            </button>
                                            <button
                                                onClick={() => exportGenome(ind.genome)}
                                                className="glass-btn text-[9px] py-1 px-2 text-zinc-400 border-zinc-600/30 hover:bg-zinc-400/10"
                                                title="导出基因组"
                                            >
                                                <Download size={10} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="text-[9px] text-zinc-600 pt-2 border-t border-white/5">
                        <p>💡 遗传算法在独立的小区域内随机生成初始配置，通过选择、交叉、变异迭代演化，寻找满足目标模式的初始细胞布局。</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function FitnessChart({ history }: { history: { generation: number; bestFitness: number; avgFitness: number }[] }) {
    if (history.length < 2) return null;

    const width = 240;
    const height = 50;
    const padding = 2;
    const maxFitness = 1.0;

    const bestPoints = history.map((h, i) => {
        const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
        const y = padding + (1 - h.bestFitness / maxFitness) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    const avgPoints = history.map((h, i) => {
        const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
        const y = padding + (1 - h.avgFitness / maxFitness) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="w-full">
            <polyline
                points={bestPoints}
                fill="none"
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <polyline
                points={avgPoints}
                fill="none"
                stroke="#71717a"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2,2"
            />
        </svg>
    );
}
