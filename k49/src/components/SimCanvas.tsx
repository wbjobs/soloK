import { useEffect, useRef, useCallback, useState } from 'react';
import { GOLSimulator } from '@/webgl/GOLSimulator';
import { useSimStore } from '@/store/useSimStore';
import { PATTERNS } from '@/data/patterns';
import { createModeDetectorWorker, ModeDetectionResult } from '@/workers/modeDetector';

export default function SimCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simRef = useRef<GOLSimulator | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const animRef = useRef<number>(0);
    const runningRef = useRef(false);
    const speedRef = useRef(15);
    const generationRef = useRef(0);
    const heatmapRef = useRef(false);
    const lastStepTimeRef = useRef(0);
    const fpsFramesRef = useRef(0);
    const fpsTimeRef = useRef(0);
    const isDraggingRef = useRef(false);
    const isPanningRef = useRef(false);
    const lastMouseRef = useRef<[number, number]>([0, 0]);
    const stepCountRef = useRef(0);
    const brushSizeRef = useRef(1);
    const selectedPatternRef = useRef<string | null>(null);
    const [webglError, setWebglError] = useState<string | null>(null);
    const gridSize = useSimStore((s) => s.gridSize);
    const store = useSimStore;

    const initSim = useCallback(() => {
        if (!canvasRef.current) return;
        try {
            const sim = new GOLSimulator(canvasRef.current, gridSize);
            sim.init();
            simRef.current = sim;
            setWebglError(null);
            (window as any).__golSimulator = sim;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'WebGL2 initialization failed';
            setWebglError(msg);
            console.error('GOLSimulator init error:', e);
            return;
        }

        const worker = createModeDetectorWorker();
        worker.onmessage = (e: MessageEvent<ModeDetectionResult & { generation: number }>) => {
            store.getState().setDetectedMode(e.data.mode);
            store.getState().setOscillatorPeriod(e.data.oscillatorPeriod);
            store.getState().setModeConfidence(e.data.confidence);
        };
        workerRef.current = worker;
    }, [gridSize, store]);

    useEffect(() => {
        initSim();
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            simRef.current?.dispose();
            workerRef.current?.terminate();
            delete (window as any).__golSimulator;
        };
    }, [initSim]);

    useEffect(() => {
        const unsub = store.subscribe((state) => {
            runningRef.current = state.isRunning;
            speedRef.current = state.speed;
            heatmapRef.current = state.heatmapEnabled;
            brushSizeRef.current = state.brushSize;
            selectedPatternRef.current = state.selectedPattern;
        });
        runningRef.current = store.getState().isRunning;
        speedRef.current = store.getState().speed;
        heatmapRef.current = store.getState().heatmapEnabled;
        brushSizeRef.current = store.getState().brushSize;
        selectedPatternRef.current = store.getState().selectedPattern;
        return unsub;
    }, [store]);

    useEffect(() => {
        const handleResize = () => {
            const sim = simRef.current;
            const canvas = canvasRef.current;
            if (!sim || !canvas) return;
            const parent = canvas.parentElement;
            if (parent) sim.resize(parent.clientWidth, parent.clientHeight);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        const observer = new ResizeObserver(handleResize);
        if (canvasRef.current?.parentElement) {
            observer.observe(canvasRef.current.parentElement);
        }
        return () => {
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, []);

    const drawCells = useCallback((screenX: number, screenY: number, alive: boolean) => {
        const sim = simRef.current;
        if (!sim) return;
        const [gx, gy] = sim.screenToGrid(screenX, screenY);
        const pat = selectedPatternRef.current;
        if (pat && alive) {
            const pattern = PATTERNS[pat];
            if (pattern) {
                sim.placePattern(pattern.cells, gx, gy);
                return;
            }
        }
        const bs = brushSizeRef.current;
        const half = Math.floor(bs / 2);
        const cells: [number, number][] = [];
        for (let dy = -half; dy <= half; dy++) {
            for (let dx = -half; dx <= half; dx++) {
                cells.push([gx + dx, gy + dy]);
            }
        }
        sim.setCells(cells, alive);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
                isPanningRef.current = true;
                lastMouseRef.current = [e.clientX, e.clientY];
                e.preventDefault();
                return;
            }
            if (e.button === 0) {
                isDraggingRef.current = true;
                drawCells(e.clientX, e.clientY, true);
            } else if (e.button === 2) {
                isDraggingRef.current = true;
                drawCells(e.clientX, e.clientY, false);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (isPanningRef.current) {
                const sim = simRef.current;
                if (!sim) return;
                const [ox, oy] = sim.getOffset();
                const rect = canvas.getBoundingClientRect();
                const dx = (e.clientX - lastMouseRef.current[0]) / rect.width / sim.getZoom();
                const dy = -(e.clientY - lastMouseRef.current[1]) / rect.height / sim.getZoom();
                sim.setOffset(ox + dx, oy + dy);
                lastMouseRef.current = [e.clientX, e.clientY];
                return;
            }
            if (isDraggingRef.current) {
                const alive = (e.buttons & 1) !== 0;
                drawCells(e.clientX, e.clientY, alive);
            }
        };

        const onMouseUp = () => {
            isDraggingRef.current = false;
            isPanningRef.current = false;
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const sim = simRef.current;
            if (!sim) return;
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            sim.setZoom(sim.getZoom() * factor);
        };

        const onContextMenu = (e: Event) => e.preventDefault();

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', onContextMenu);

        return () => {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('mouseleave', onMouseUp);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('contextmenu', onContextMenu);
        };
    }, [drawCells]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
            const s = store.getState();
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    s.toggleRunning();
                    break;
                case 'n':
                case 'N':
                    if (!runningRef.current) {
                        const sim = simRef.current;
                        if (sim) {
                            sim.step();
                            generationRef.current++;
                            s.setGeneration(generationRef.current);
                        }
                    }
                    break;
                case 'r':
                case 'R':
                    handleReset();
                    break;
                case 'h':
                case 'H':
                    s.toggleHeatmap();
                    break;
                case '+':
                case '=':
                    s.setSpeed(Math.min(60, s.speed + 5));
                    break;
                case '-':
                case '_':
                    s.setSpeed(Math.max(1, s.speed - 5));
                    break;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [store]);

    useEffect(() => {
        let active = true;
        const animate = (time: number) => {
            if (!active) return;
            const sim = simRef.current;
            if (!sim) {
                animRef.current = requestAnimationFrame(animate);
                return;
            }

            sim.setHeatmap(heatmapRef.current);
            sim.render();

            if (runningRef.current) {
                const interval = 1000 / speedRef.current;
                if (time - lastStepTimeRef.current >= interval) {
                    sim.step();
                    generationRef.current++;
                    stepCountRef.current++;
                    lastStepTimeRef.current = time;
                    const s = store.getState();
                    s.setGeneration(generationRef.current);

                    if (stepCountRef.current % 20 === 0) {
                        const data = sim.readState();
                        let count = 0;
                        for (let i = 0; i < data.length; i += 4) {
                            if (data[i] > 128) count++;
                        }
                        s.setLiveCells(count);

                        if (workerRef.current) {
                            const bufCopy = data.buffer.slice(0);
                            workerRef.current.postMessage(
                                { data: bufCopy, width: gridSize, generation: generationRef.current },
                                [bufCopy],
                            );
                        }
                    }
                }
            }

            fpsFramesRef.current++;
            if (time - fpsTimeRef.current >= 1000) {
                store.getState().setFps(fpsFramesRef.current);
                fpsFramesRef.current = 0;
                fpsTimeRef.current = time;
            }

            animRef.current = requestAnimationFrame(animate);
        };

        animRef.current = requestAnimationFrame(animate);
        return () => {
            active = false;
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, [gridSize, store]);

    const handleStep = useCallback(() => {
        const sim = simRef.current;
        if (!sim) return;
        sim.step();
        generationRef.current++;
        const data = sim.readState();
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 128) count++;
        }
        store.getState().setGeneration(generationRef.current);
        store.getState().setLiveCells(count);
    }, [store]);

    const handleReset = useCallback(() => {
        const sim = simRef.current;
        if (!sim) return;
        sim.reset();
        generationRef.current = 0;
        stepCountRef.current = 0;
        store.getState().resetSim();
    }, [store]);

    const handleRandomize = useCallback(() => {
        const sim = simRef.current;
        if (!sim) return;
        sim.randomize(0.3);
        generationRef.current = 0;
        stepCountRef.current = 0;
        const data = sim.readState();
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 128) count++;
        }
        const s = store.getState();
        s.setLiveCells(count);
        s.setGeneration(0);
    }, [store]);

    const isRunning = useSimStore((s) => s.isRunning);
    const heatmapEnabled = useSimStore((s) => s.heatmapEnabled);

    if (webglError) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#0a0e17] text-red-400 font-mono text-sm p-8 text-center">
                <div>
                    <p className="text-lg font-bold mb-2">WebGL2 不可用</p>
                    <p>{webglError}</p>
                    <p className="mt-4 text-zinc-500">请使用支持 WebGL2 的现代浏览器</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full overflow-hidden">
            <canvas
                ref={canvasRef}
                className="w-full h-full block cursor-crosshair"
            />
            <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
                <button
                    onClick={() => store.getState().toggleRunning()}
                    className="glass-btn px-4 py-2 text-sm font-mono flex items-center gap-2"
                >
                    {isRunning ? '⏸ 暂停' : '▶ 播放'}
                </button>
                <button
                    onClick={handleStep}
                    disabled={isRunning}
                    className="glass-btn px-4 py-2 text-sm font-mono disabled:opacity-40"
                >
                    ⏭ 步进
                </button>
                <button
                    onClick={handleReset}
                    className="glass-btn px-4 py-2 text-sm font-mono"
                >
                    ↺ 重置
                </button>
                <button
                    onClick={handleRandomize}
                    className="glass-btn px-4 py-2 text-sm font-mono"
                >
                    🎲 随机
                </button>
                <button
                    onClick={() => store.getState().toggleHeatmap()}
                    className={`glass-btn px-4 py-2 text-sm font-mono ${heatmapEnabled ? 'ring-1 ring-cyan-400/50' : ''}`}
                >
                    🌡 热力图
                </button>
            </div>
            <div className="absolute top-3 left-3 text-[10px] text-zinc-600 font-mono select-none pointer-events-none">
                Space: 播放/暂停 · N: 步进 · R: 重置 · H: 热力图 · +/-: 调速
            </div>
        </div>
    );
}
