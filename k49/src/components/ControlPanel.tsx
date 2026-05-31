import { useSimStore } from '@/store/useSimStore';
import { PATTERN_LIST } from '@/data/patterns';
import { DetectedMode } from '@/workers/modeDetector';
import GAPanel from './GAPanel';
import {
    Play, Pause, SkipForward, RotateCcw, Dice5, Thermometer,
    ChevronRight, ChevronLeft, Brush, ZoomIn, ZoomOut,
} from 'lucide-react';

const MODE_CONFIG: Record<DetectedMode, { label: string; color: string; desc: string }> = {
    stable: { label: '稳定态', color: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10', desc: '演化已停止变化' },
    oscillator: { label: '振荡器', color: 'text-blue-400 border-blue-400/40 bg-blue-400/10', desc: '周期性重复模式' },
    glider: { label: '滑行态', color: 'text-orange-400 border-orange-400/40 bg-orange-400/10', desc: '整体位移运动' },
    chaos: { label: '混沌态', color: 'text-red-400 border-red-400/40 bg-red-400/10', desc: '无规律演化' },
    unknown: { label: '分析中', color: 'text-zinc-400 border-zinc-400/40 bg-zinc-400/10', desc: '正在收集数据...' },
};

export default function ControlPanel() {
    const {
        generation, liveCells, density, fps, speed,
        heatmapEnabled, brushSize, selectedPattern,
        detectedMode, oscillatorPeriod, modeConfidence, panelCollapsed,
        setSpeed, setBrushSize, setSelectedPattern, togglePanel, toggleHeatmap,
    } = useSimStore();

    const modeCfg = MODE_CONFIG[detectedMode];

    return (
        <div className={`relative flex h-full transition-all duration-300 ${panelCollapsed ? 'w-10' : 'w-72'}`}>
            <button
                onClick={togglePanel}
                className="absolute -left-8 top-1/2 -translate-y-1/2 z-10 glass-btn w-8 h-16 flex items-center justify-center rounded-l-lg rounded-r-none"
            >
                {panelCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>

            {!panelCollapsed && (
                <div className="w-72 h-full glass-panel p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <div className="text-center">
                        <h1 className="text-lg font-bold tracking-wider text-cyan-300 font-display">
                            GAME OF LIFE
                        </h1>
                        <p className="text-[10px] text-zinc-500 tracking-widest uppercase">
                            GPU Accelerated Cellular Automaton
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <StatCard label="世代" value={generation.toLocaleString()} icon="⏳" />
                        <StatCard label="活细胞" value={liveCells.toLocaleString()} icon="🧬" />
                        <StatCard label="密度" value={`${(density * 100).toFixed(2)}%`} icon="📊" />
                        <StatCard label="FPS" value={fps.toString()} icon="⚡" />
                    </div>

                    <div className="border-t border-white/5 pt-3">
                        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">模拟速度</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 w-6">1</span>
                            <input
                                type="range"
                                min={1}
                                max={60}
                                value={speed}
                                onChange={(e) => setSpeed(Number(e.target.value))}
                                className="flex-1 accent-cyan-400 h-1"
                            />
                            <span className="text-xs text-zinc-400 w-8">{speed}/s</span>
                        </div>
                    </div>

                    <div className="border-t border-white/5 pt-3">
                        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">画笔大小</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 w-4">1</span>
                            <input
                                type="range"
                                min={1}
                                max={10}
                                value={brushSize}
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="flex-1 accent-purple-400 h-1"
                            />
                            <span className="text-xs text-zinc-400 w-6">{brushSize}px</span>
                        </div>
                    </div>

                    <div className="border-t border-white/5 pt-3">
                        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">预设图案</h3>
                        <select
                            value={selectedPattern || ''}
                            onChange={(e) => setSelectedPattern(e.target.value || null)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        >
                            <option value="">自由绘制</option>
                            {PATTERN_LIST.map((p) => (
                                <option key={p.key} value={p.key}>{p.nameCN} ({p.name})</option>
                            ))}
                        </select>
                        {selectedPattern && (
                            <p className="text-[10px] text-zinc-500 mt-1">
                                点击画布放置图案，切换回"自由绘制"可手动绘制
                            </p>
                        )}
                    </div>

                    <div className="border-t border-white/5 pt-3">
                        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">显示模式</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={toggleHeatmap}
                                className={`flex-1 glass-btn text-xs py-1.5 flex items-center justify-center gap-1 ${heatmapEnabled ? 'ring-1 ring-cyan-400/50' : ''}`}
                            >
                                <Thermometer size={12} />
                                {heatmapEnabled ? '热力图' : '标准'}
                            </button>
                        </div>
                    </div>

                    <div className="border-t border-white/5 pt-3">
                        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">模式检测</h3>
                        <div className={`rounded-lg border px-3 py-2 ${modeCfg.color}`}>
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-sm">{modeCfg.label}</span>
                                {modeConfidence > 0 && (
                                    <span className="text-[10px] opacity-60">
                                        {(modeConfidence * 100).toFixed(0)}%
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] opacity-70 mt-0.5">{modeCfg.desc}</p>
                            {oscillatorPeriod && (
                                <p className="text-[10px] mt-1 opacity-60">
                                    周期: {oscillatorPeriod} 步
                                </p>
                            )}
                        </div>
                    </div>

                    <GAPanel />

                    <div className="border-t border-white/5 pt-3">
                        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">操作说明</h3>
                        <div className="text-[10px] text-zinc-500 space-y-1">
                            <p>🖱 左键 — 放置细胞 / 右键 — 擦除</p>
                            <p>🖱 中键 / Ctrl+左键 — 平移视图</p>
                            <p>🔄 滚轮 — 缩放视图</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
    return (
        <div className="bg-white/[0.03] rounded-lg p-2 border border-white/[0.05]">
            <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                <span>{icon}</span>{label}
            </div>
            <div className="text-base font-mono font-bold text-zinc-100 mt-0.5 truncate">{value}</div>
        </div>
    );
}
