import { create } from 'zustand';
import type {
  Device, DeviceTelemetry, RoboticArmState, ConveyorBeltState,
  VisionInspectorState, AnomalyEvent, VirtualLimit, User, MutexLock
} from '../types';

interface DeviceState {
  devices: Device[];
  telemetry: Map<string, DeviceTelemetry>;
  roboticArmStates: Map<string, RoboticArmState>;
  conveyorStates: Map<string, ConveyorBeltState>;
  visionStates: Map<string, VisionInspectorState>;
  anomalies: AnomalyEvent[];
  virtualLimits: VirtualLimit[];
  currentUser: User | null;
  locks: MutexLock[];
  selectedDeviceId: string | null;
  isCalibrating: boolean;
  calibrationPoints: { measured: { x: number; y: number; z: number }[]; design: { x: number; y: number; z: number }[] };

  setDevices: (devices: Device[]) => void;
  updateDevice: (device: Device) => void;
  setTelemetry: (deviceId: string, tel: DeviceTelemetry) => void;
  setRoboticArmState: (state: RoboticArmState) => void;
  setConveyorState: (state: ConveyorBeltState) => void;
  setVisionState: (state: VisionInspectorState) => void;
  addAnomaly: (anomaly: AnomalyEvent) => void;
  setAnomalies: (anomalies: AnomalyEvent[]) => void;
  acknowledgeAnomaly: (id: string) => void;
  setVirtualLimits: (limits: VirtualLimit[]) => void;
  addVirtualLimit: (limit: VirtualLimit) => void;
  updateVirtualLimit: (limit: VirtualLimit) => void;
  removeVirtualLimit: (id: string) => void;
  setCurrentUser: (user: User | null) => void;
  setLocks: (locks: MutexLock[]) => void;
  setSelectedDevice: (id: string | null) => void;
  setIsCalibrating: (calibrating: boolean) => void;
  addCalibrationPoint: (measured: { x: number; y: number; z: number }, design: { x: number; y: number; z: number }) => void;
  clearCalibrationPoints: () => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  telemetry: new Map(),
  roboticArmStates: new Map(),
  conveyorStates: new Map(),
  visionStates: new Map(),
  anomalies: [],
  virtualLimits: [],
  currentUser: null,
  locks: [],
  selectedDeviceId: null,
  isCalibrating: false,
  calibrationPoints: { measured: [], design: [] },

  setDevices: (devices) => set({ devices }),
  updateDevice: (device) => set((state) => ({
    devices: state.devices.map((d) => d.id === device.id ? device : d)
  })),

  setTelemetry: (deviceId, tel) => {
    const state = get();
    state.telemetry.set(deviceId, tel);
    set({ telemetry: new Map(state.telemetry) });
  },

  setRoboticArmState: (state) => {
    const prev = get();
    prev.roboticArmStates.set(state.device_id, state);
    set({ roboticArmStates: new Map(prev.roboticArmStates) });
  },

  setConveyorState: (state) => {
    const prev = get();
    prev.conveyorStates.set(state.device_id, state);
    set({ conveyorStates: new Map(prev.conveyorStates) });
  },

  setVisionState: (state) => {
    const prev = get();
    prev.visionStates.set(state.device_id, state);
    set({ visionStates: new Map(prev.visionStates) });
  },

  addAnomaly: (anomaly) => set((state) => ({
    anomalies: [anomaly, ...state.anomalies].slice(0, 100)
  })),
  setAnomalies: (anomalies) => set({ anomalies }),
  acknowledgeAnomaly: (id) => set((state) => ({
    anomalies: state.anomalies.map((a) => a.id === id ? { ...a, acknowledged: true } : a)
  })),
  setVirtualLimits: (limits) => set({ virtualLimits: limits }),
  addVirtualLimit: (limit) => set((state) => ({
    virtualLimits: [...state.virtualLimits, limit]
  })),
  updateVirtualLimit: (limit) => set((state) => ({
    virtualLimits: state.virtualLimits.map((l) => l.id === limit.id ? limit : l)
  })),
  removeVirtualLimit: (id) => set((state) => ({
    virtualLimits: state.virtualLimits.filter((l) => l.id !== id)
  })),
  setCurrentUser: (user) => set({ currentUser: user }),
  setLocks: (locks) => set({ locks }),
  setSelectedDevice: (id) => set({ selectedDeviceId: id }),
  setIsCalibrating: (calibrating) => set({ isCalibrating: calibrating }),
  addCalibrationPoint: (measured, design) => set((state) => ({
    calibrationPoints: {
      measured: [...state.calibrationPoints.measured, measured],
      design: [...state.calibrationPoints.design, design]
    }
  })),
  clearCalibrationPoints: () => set({
    calibrationPoints: { measured: [], design: [] }
  })
}));
