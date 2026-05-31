import { create } from 'zustand';
import { AlertEvent, DetectionResult, CameraConfig, DetectionSettings, StatisticsData, GroupEvent } from '../types';

interface AppState {
  cameras: CameraConfig[];
  activeCameraId: string | null;
  detections: Map<string, DetectionResult[]>;
  alerts: AlertEvent[];
  groupEvents: GroupEvent[];
  statistics: StatisticsData;
  settings: DetectionSettings;
  isRecording: boolean;
  fps: number;
  modelLatency: number;

  setCameras: (cameras: CameraConfig[]) => void;
  setActiveCamera: (id: string | null) => void;
  updateDetections: (cameraId: string, results: DetectionResult[]) => void;
  addAlert: (alert: AlertEvent) => void;
  addGroupEvent: (event: GroupEvent) => void;
  updateStatistics: (stats: Partial<StatisticsData>) => void;
  updateSettings: (settings: Partial<DetectionSettings>) => void;
  setRecording: (recording: boolean) => void;
  setFps: (fps: number) => void;
  setModelLatency: (latency: number) => void;
  clearAlerts: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  cameras: [
    {
      id: 'cam1',
      name: '扶梯1号',
      type: 'webcam',
      enabled: true,
      escalatorDirection: 'up'
    },
    {
      id: 'cam2',
      name: '扶梯2号',
      type: 'webcam',
      enabled: false,
      escalatorDirection: 'down'
    },
    {
      id: 'cam3',
      name: '扶梯3号',
      type: 'webcam',
      enabled: false,
      escalatorDirection: 'up'
    },
    {
      id: 'cam4',
      name: '扶梯4号',
      type: 'webcam',
      enabled: false,
      escalatorDirection: 'down'
    }
  ],
  activeCameraId: null,
  detections: new Map(),
  alerts: [],
  groupEvents: [],
  statistics: {
    totalAlerts: 0,
    byType: { fall: 0, retrograde: 0, luggage: 0, jump: 0, overcrowding: 0, pushing: 0, panic: 0 },
    byHour: {}
  },
  settings: {
    fallThreshold: 60,
    fallHeightDropRatio: 0.5,
    elderlyFallThreshold: 45,
    elderlyFallHeightDropRatio: 0.35,
    retrogradeDuration: 1000,
    luggageDistanceRatio: 0.8,
    jumpVerticalSpeed: 0.5,
    jumpStepFrequency: 3,
    blurFace: true,
    enableAudioAlert: true,
    alertVolume: 0.5,
    enableAgeDetection: true,
    enableGroupDetection: true,
    maxDensityPerSqm: 3
  },
  isRecording: false,
  fps: 0,
  modelLatency: 0,

  setCameras: (cameras) => set({ cameras }),
  setActiveCamera: (id) => set({ activeCameraId: id }),
  updateDetections: (cameraId, results) => set((state) => {
    const newDetections = new Map(state.detections);
    newDetections.set(cameraId, results);
    return { detections: newDetections };
  }),
  addAlert: (alert) => set((state) => ({
    alerts: [alert, ...state.alerts].slice(0, 100)
  })),
  addGroupEvent: (event) => set((state) => ({
    groupEvents: [event, ...state.groupEvents].slice(0, 50)
  })),
  updateStatistics: (stats) => set((state) => ({
    statistics: { ...state.statistics, ...stats }
  })),
  updateSettings: (settings) => set((state) => ({
    settings: { ...state.settings, ...settings }
  })),
  setRecording: (recording) => set({ isRecording: recording }),
  setFps: (fps) => set({ fps }),
  setModelLatency: (latency) => set({ modelLatency: latency }),
  clearAlerts: () => set({ alerts: [], groupEvents: [] })
}));
