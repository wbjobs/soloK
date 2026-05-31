import { create } from 'zustand';
import { Scene, SimulationConfig, KPIReport, ShipSchedule, InterferenceEvent } from '../types';
import { SimulationEngine } from '../engine/SimulationEngine';
import { createDefaultScene } from '../mock/defaultScene';
import { DEFAULT_SIMULATION_CONFIG, STORAGE_KEYS } from '../utils/constants';
import { RLScheduler } from '../engine/rl/RLScheduler';
import { DigitalTwin, SyncReport, TOSData } from '../engine/digitalTwin/DigitalTwin';
import { PredictionEngine } from '../engine/digitalTwin/PredictionEngine';
import { TOSSimulator } from '../engine/digitalTwin/TOSSimulator';
import { AlgorithmBenchmark, ComparisonReport } from '../engine/AlgorithmBenchmark';

interface SimulationStore {
  scene: Scene;
  engine: SimulationEngine | null;
  rlScheduler: RLScheduler | null;
  digitalTwin: DigitalTwin | null;
  predictionEngine: PredictionEngine | null;
  tosSimulator: TOSSimulator | null;
  algorithmBenchmark: AlgorithmBenchmark | null;
  selectedAGVId: string | null;
  cameraMode: 'free' | 'follow';
  showHeatmap: boolean;
  showPaths: boolean;
  showRoadNetwork: boolean;
  activeEvents: InterferenceEvent[];
  report: KPIReport | null;
  shipSchedules: ShipSchedule[];
  isLoading: boolean;
  error: string | null;
  lastSyncReport: SyncReport | null;
  
  initEngine: () => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  update: (deltaTime: number) => void;
  selectAGV: (agvId: string | null) => void;
  setCameraMode: (mode: 'free' | 'follow') => void;
  toggleHeatmap: () => void;
  togglePaths: () => void;
  toggleRoadNetwork: () => void;
  generateReport: () => KPIReport;
  saveScene: (name: string, description: string) => void;
  loadScene: (sceneId: string) => void;
  deleteScene: (sceneId: string) => void;
  getSavedScenes: () => Scene[];
  importShipSchedules: (schedules: ShipSchedule[]) => void;
  triggerAGVFault: (agvId: string) => void;
  updateConfig: (config: Partial<SimulationConfig>) => void;
  
  initRLScheduler: () => void;
  startRLTraining: () => void;
  stopRLTraining: () => void;
  saveRLModel: () => void;
  loadRLModel: () => void;
  
  initDigitalTwin: () => void;
  startTwinSync: () => void;
  stopTwinSync: () => void;
  manualSync: () => void;
  
  initPredictionEngine: () => void;
  startPrediction: () => void;
  stopPrediction: () => void;
  
  initBenchmark: () => void;
  runBenchmark: () => void;
  stopBenchmark: () => void;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  scene: createDefaultScene(),
  engine: null,
  rlScheduler: null,
  digitalTwin: null,
  predictionEngine: null,
  tosSimulator: null,
  algorithmBenchmark: null,
  selectedAGVId: null,
  cameraMode: 'free',
  showHeatmap: false,
  showPaths: true,
  showRoadNetwork: true,
  activeEvents: [],
  report: null,
  shipSchedules: [],
  isLoading: false,
  error: null,
  lastSyncReport: null,

  initEngine: () => {
    const { scene } = get();
    const engine = new SimulationEngine(scene);
    engine.setOnUpdate((updatedScene) => {
      set({ 
        scene: { ...updatedScene },
        activeEvents: engine.getActiveEvents(),
      });
    });
    set({ engine });
  },

  start: () => {
    const { engine } = get();
    if (engine) {
      engine.start();
      set({ scene: { ...get().scene, simulationState: { ...get().scene.simulationState, isRunning: true } } });
    }
  },

  pause: () => {
    const { engine } = get();
    if (engine) {
      engine.pause();
      set({ scene: { ...get().scene, simulationState: { ...get().scene.simulationState, isRunning: false } } });
    }
  },

  reset: () => {
    const { engine } = get();
    if (engine) {
      engine.reset();
      set({ 
        scene: { ...get().scene },
        activeEvents: [],
        report: null,
      });
    }
  },

  setSpeed: (speed: number) => {
    const { engine } = get();
    if (engine) {
      engine.setSpeed(speed);
      set({ scene: { ...get().scene, simulationState: { ...get().scene.simulationState, speed } } });
    }
  },

  update: (deltaTime: number) => {
    const { engine } = get();
    if (engine) {
      engine.update(deltaTime);
    }
  },

  selectAGV: (agvId: string | null) => {
    set({ selectedAGVId: agvId });
  },

  setCameraMode: (mode: 'free' | 'follow') => {
    set({ cameraMode: mode });
  },

  toggleHeatmap: () => {
    set((state) => ({ showHeatmap: !state.showHeatmap }));
  },

  togglePaths: () => {
    set((state) => ({ showPaths: !state.showPaths }));
  },

  toggleRoadNetwork: () => {
    set((state) => ({ showRoadNetwork: !state.showRoadNetwork }));
  },

  generateReport: () => {
    const { engine } = get();
    if (engine) {
      const report = engine.generateReport();
      set({ report });
      return report;
    }
    return {} as KPIReport;
  },

  saveScene: (name: string, description: string) => {
    const { scene } = get();
    const savedScenes = get().getSavedScenes();
    
    const sceneToSave: Scene = {
      ...scene,
      id: `scene-${Date.now()}`,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    savedScenes.push(sceneToSave);
    localStorage.setItem(STORAGE_KEYS.scenes, JSON.stringify(savedScenes));
  },

  loadScene: (sceneId: string) => {
    const savedScenes = get().getSavedScenes();
    const scene = savedScenes.find(s => s.id === sceneId);
    
    if (scene) {
      const engine = new SimulationEngine(scene);
      engine.setOnUpdate((updatedScene) => {
        set({ 
          scene: { ...updatedScene },
          activeEvents: engine.getActiveEvents(),
        });
      });
      
      set({ 
        scene: { ...scene },
        engine,
        activeEvents: [],
      });
    }
  },

  deleteScene: (sceneId: string) => {
    const savedScenes = get().getSavedScenes();
    const filtered = savedScenes.filter(s => s.id !== sceneId);
    localStorage.setItem(STORAGE_KEYS.scenes, JSON.stringify(filtered));
  },

  getSavedScenes: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.scenes);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  importShipSchedules: (schedules: ShipSchedule[]) => {
    set((state) => ({
      scene: {
        ...state.scene,
        shipSchedules: schedules,
      },
      shipSchedules: schedules,
    }));
  },

  triggerAGVFault: (agvId: string) => {
    const { engine } = get();
    if (engine) {
      engine.triggerAGVFault(agvId);
    }
  },

  updateConfig: (config: Partial<SimulationConfig>) => {
    set((state) => ({
      scene: {
        ...state.scene,
        config: { ...state.scene.config, ...config },
      },
    }));
  },

  initRLScheduler: () => {
    const { scene } = get();
    const rlScheduler = new RLScheduler(scene);
    set({ rlScheduler });
  },

  startRLTraining: () => {
    const { rlScheduler, scene } = get();
    if (rlScheduler) {
      rlScheduler.setScene(scene);
      rlScheduler.startTraining();
    }
  },

  stopRLTraining: () => {
    const { rlScheduler } = get();
    if (rlScheduler) {
      rlScheduler.stopTraining();
    }
  },

  saveRLModel: () => {
    const { rlScheduler } = get();
    if (rlScheduler) {
      const weights = rlScheduler.saveModel();
      localStorage.setItem('rl_model_weights', JSON.stringify(weights));
    }
  },

  loadRLModel: () => {
    const { rlScheduler } = get();
    if (rlScheduler) {
      const data = localStorage.getItem('rl_model_weights');
      if (data) {
        try {
          const weights = JSON.parse(data);
          rlScheduler.loadModel(weights);
        } catch (e) {
          console.error('Failed to load RL model:', e);
        }
      }
    }
  },

  initDigitalTwin: () => {
    const { scene } = get();
    const digitalTwin = new DigitalTwin(scene);
    const tosSimulator = new TOSSimulator(scene);
    set({ digitalTwin, tosSimulator });
  },

  startTwinSync: () => {
    const { digitalTwin, tosSimulator, scene } = get();
    if (digitalTwin && tosSimulator) {
      digitalTwin.setScene(scene);
      tosSimulator.updateScene(scene);
      digitalTwin.startSync(async () => {
        return tosSimulator.generateTOSData();
      });
      digitalTwin.onSync((data) => {
        const report = digitalTwin.syncFromTOS(data);
        set({ lastSyncReport: report });
      });
    }
  },

  stopTwinSync: () => {
    const { digitalTwin } = get();
    if (digitalTwin) {
      digitalTwin.stopSync();
    }
  },

  manualSync: () => {
    const { digitalTwin, tosSimulator, scene } = get();
    if (digitalTwin && tosSimulator) {
      digitalTwin.setScene(scene);
      tosSimulator.updateScene(scene);
      const tosData = tosSimulator.generateTOSData();
      const report = digitalTwin.syncFromTOS(tosData);
      set({ lastSyncReport: report });
    }
  },

  initPredictionEngine: () => {
    const { scene } = get();
    const predictionEngine = new PredictionEngine(scene);
    set({ predictionEngine });
  },

  startPrediction: () => {
    const { predictionEngine } = get();
    if (predictionEngine) {
      predictionEngine.start();
    }
  },

  stopPrediction: () => {
    const { predictionEngine } = get();
    if (predictionEngine) {
      predictionEngine.stop();
    }
  },

  initBenchmark: () => {
    const benchmark = new AlgorithmBenchmark();
    set({ algorithmBenchmark: benchmark });
  },

  runBenchmark: () => {
    const { algorithmBenchmark, scene } = get();
    if (algorithmBenchmark) {
      algorithmBenchmark.runBenchmark(scene);
    }
  },

  stopBenchmark: () => {
    const { algorithmBenchmark } = get();
    if (algorithmBenchmark) {
      algorithmBenchmark.stop();
    }
  },
}));
