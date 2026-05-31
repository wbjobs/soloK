import { create } from 'zustand';
import { DetectedMode } from '@/workers/modeDetector';
import { GASearchConfig, GASearchProgress, GASearchResult, GATargetType, GAIndividual } from '@/workers/gaSearch';

export const DEFAULT_GA_CONFIG: GASearchConfig = {
    targetType: 'oscillator',
    targetPeriod: 15,
    targetLiveCells: 50,
    searchRegionSize: 32,
    populationSize: 50,
    mutationRate: 0.01,
    crossoverRate: 0.7,
    tournamentSize: 3,
    maxGenerations: 100,
    evaluationSteps: 200,
    elitismCount: 2,
};

export interface SimStore {
    gridSize: number;
    generation: number;
    isRunning: boolean;
    speed: number;
    liveCells: number;
    density: number;
    fps: number;
    heatmapEnabled: boolean;
    brushSize: number;
    selectedPattern: string | null;
    detectedMode: DetectedMode;
    oscillatorPeriod: number | null;
    modeConfidence: number;
    panelCollapsed: boolean;
    gaExpanded: boolean;
    gaConfig: GASearchConfig;
    gaProgress: GASearchProgress;
    gaResult: GASearchResult | null;
    gaBestIndividuals: (GAIndividual & { cells: [number, number][] })[];

    setRunning: (v: boolean) => void;
    toggleRunning: () => void;
    setSpeed: (v: number) => void;
    setGeneration: (v: number) => void;
    incrementGeneration: () => void;
    setLiveCells: (v: number) => void;
    setDensity: (v: number) => void;
    setFps: (v: number) => void;
    setHeatmapEnabled: (v: boolean) => void;
    toggleHeatmap: () => void;
    setBrushSize: (v: number) => void;
    setSelectedPattern: (v: string | null) => void;
    setDetectedMode: (v: DetectedMode) => void;
    setOscillatorPeriod: (v: number | null) => void;
    setModeConfidence: (v: number) => void;
    togglePanel: () => void;
    resetSim: () => void;

    toggleGAExpanded: () => void;
    setGAConfig: (config: Partial<GASearchConfig>) => void;
    setGAProgress: (progress: Partial<GASearchProgress>) => void;
    setGAResult: (result: GASearchResult | null) => void;
    addGABestIndividual: (ind: GAIndividual, cells: [number, number][]) => void;
    clearGAResults: () => void;
    resetGAConfig: () => void;
}

export const useSimStore = create<SimStore>((set) => ({
    gridSize: 512,
    generation: 0,
    isRunning: false,
    speed: 15,
    liveCells: 0,
    density: 0,
    fps: 0,
    heatmapEnabled: false,
    brushSize: 1,
    selectedPattern: null,
    detectedMode: 'unknown',
    oscillatorPeriod: null,
    modeConfidence: 0,
    panelCollapsed: false,
    gaExpanded: false,
    gaConfig: { ...DEFAULT_GA_CONFIG },
    gaProgress: {
        generation: 0,
        bestFitness: 0,
        avgFitness: 0,
        bestIndividual: null,
        targetType: 'oscillator',
        isSearching: false,
        history: [],
    },
    gaResult: null,
    gaBestIndividuals: [],

    setRunning: (v) => set({ isRunning: v }),
    toggleRunning: () => set((s) => ({ isRunning: !s.isRunning })),
    setSpeed: (v) => set({ speed: v }),
    setGeneration: (v) => set({ generation: v }),
    incrementGeneration: () => set((s) => ({ generation: s.generation + 1 })),
    setLiveCells: (v) => set((s) => ({ liveCells: v, density: v / (s.gridSize * s.gridSize) })),
    setDensity: (v) => set({ density: v }),
    setFps: (v) => set({ fps: v }),
    setHeatmapEnabled: (v) => set({ heatmapEnabled: v }),
    toggleHeatmap: () => set((s) => ({ heatmapEnabled: !s.heatmapEnabled })),
    setBrushSize: (v) => set({ brushSize: v }),
    setSelectedPattern: (v) => set({ selectedPattern: v }),
    setDetectedMode: (v) => set({ detectedMode: v }),
    setOscillatorPeriod: (v) => set({ oscillatorPeriod: v }),
    setModeConfidence: (v) => set({ modeConfidence: v }),
    togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
    resetSim: () => set({
        generation: 0,
        isRunning: false,
        liveCells: 0,
        density: 0,
        detectedMode: 'unknown',
        oscillatorPeriod: null,
        modeConfidence: 0,
    }),

    toggleGAExpanded: () => set((s) => ({ gaExpanded: !s.gaExpanded })),
    setGAConfig: (config) => set((s) => ({ gaConfig: { ...s.gaConfig, ...config } })),
    setGAProgress: (progress) => set((s) => ({ gaProgress: { ...s.gaProgress, ...progress } })),
    setGAResult: (result) => set({ gaResult: result }),
    addGABestIndividual: (ind, cells) => set((s) => {
        const newInd = { ...ind, cells, genome: new Uint8Array(ind.genome) };
        const exists = s.gaBestIndividuals.some((i) => i.fitness === newInd.fitness && i.resultMode === newInd.resultMode);
        if (exists) return {};
        const updated = [...s.gaBestIndividuals, newInd]
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, 10);
        return { gaBestIndividuals: updated };
    }),
    clearGAResults: () => set({
        gaResult: null,
        gaBestIndividuals: [],
        gaProgress: {
            generation: 0,
            bestFitness: 0,
            avgFitness: 0,
            bestIndividual: null,
            targetType: 'oscillator',
            isSearching: false,
            history: [],
        },
    }),
    resetGAConfig: () => set({ gaConfig: { ...DEFAULT_GA_CONFIG } }),
}));
