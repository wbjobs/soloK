import { create } from 'zustand';

export interface ScalarFrame {
  step: number;
  time: number;
  kinetic_energy: number;
  potential_energy: number;
  total_energy: number;
  snapshot_saved: boolean;
  recording_frame_added?: boolean;
  E_x: number;
  E_y: number;
  E_z: number;
}

export interface ElectricField {
  E_x: number;
  E_y: number;
  E_z: number;
}

export interface RecordingStatus {
  is_recording: boolean;
  frame_count: number;
  record_every: number;
}

interface SimulationState {
  isConnected: boolean;
  isLoading: boolean;
  scalarFrame: ScalarFrame | null;
  error: string | null;
  electricField: ElectricField;
  recordingStatus: RecordingStatus;
  connect: () => void;
  disconnect: () => void;
  setScalarFrame: (frame: ScalarFrame) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setElectricField: (field: ElectricField) => void;
  setRecordingStatus: (status: RecordingStatus) => void;
}

const useSimulationStore = create<SimulationState>((set) => ({
  isConnected: false,
  isLoading: false,
  scalarFrame: null,
  error: null,
  electricField: { E_x: 0, E_y: 0, E_z: 0 },
  recordingStatus: { is_recording: false, frame_count: 0, record_every: 10 },
  connect: () => set({ isConnected: true, isLoading: true, error: null }),
  disconnect: () => set({ isConnected: false, isLoading: false }),
  setScalarFrame: (scalarFrame) => set({ scalarFrame, isLoading: false }),
  setConnected: (connected) => set({ isConnected: connected, isLoading: !connected }),
  setError: (error) => set({ error, isLoading: false }),
  setElectricField: (electricField) => set({ electricField }),
  setRecordingStatus: (recordingStatus) => set({ recordingStatus }),
}));

export default useSimulationStore;
