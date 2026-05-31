import { create } from 'zustand';
import type { MidiDevice, MidiMessage } from '@shared/index';

interface MidiStore {
  devices: MidiDevice[];
  connectedDeviceIds: string[];
  messageHistory: MidiMessage[];
  learning: boolean;
  learnedMessage: MidiMessage | null;
  loading: boolean;
  error: string | null;

  setDevices: (devices: MidiDevice[]) => void;
  addConnectedDeviceId: (deviceId: string) => void;
  removeConnectedDeviceId: (deviceId: string) => void;
  addMessage: (message: MidiMessage) => void;
  clearMessageHistory: () => void;
  setLearning: (learning: boolean) => void;
  setLearnedMessage: (message: MidiMessage | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getConnectedDevices: () => MidiDevice[];
}

export const useMidiStore = create<MidiStore>((set, get) => ({
  devices: [],
  connectedDeviceIds: [],
  messageHistory: [],
  learning: false,
  learnedMessage: null,
  loading: false,
  error: null,

  setDevices: (devices) => set({ devices }),

  addConnectedDeviceId: (deviceId) =>
    set((state) => ({
      connectedDeviceIds: state.connectedDeviceIds.includes(deviceId)
        ? state.connectedDeviceIds
        : [...state.connectedDeviceIds, deviceId],
    })),

  removeConnectedDeviceId: (deviceId) =>
    set((state) => ({
      connectedDeviceIds: state.connectedDeviceIds.filter((id) => id !== deviceId),
    })),

  addMessage: (message) => {
    set((state) => ({
      messageHistory: [...state.messageHistory.slice(-99), message],
    }));
  },

  clearMessageHistory: () => set({ messageHistory: [] }),

  setLearning: (learning) => set({ learning }),

  setLearnedMessage: (message) => set({ learnedMessage: message }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  getConnectedDevices: () => {
    const { devices, connectedDeviceIds } = get();
    return devices.filter((d) => connectedDeviceIds.includes(d.id));
  },
}));

export default useMidiStore;
