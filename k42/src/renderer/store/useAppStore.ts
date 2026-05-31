import { create } from 'zustand';
import type { AppConfig, Profile, ServiceStatus, LogEntry } from '@shared/index';

interface AppStore {
  config: AppConfig | null;
  currentProfile: Profile | null;
  serviceStatus: ServiceStatus;
  logs: LogEntry[];
  loading: boolean;
  error: string | null;

  setConfig: (config: AppConfig) => void;
  updateConfig: (partial: Partial<AppConfig>) => void;
  setCurrentProfile: (profile: Profile | null) => void;
  setServiceStatus: (status: ServiceStatus) => void;
  addLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
}

const initialServiceStatus: ServiceStatus = {
  running: false,
  deviceConnected: false,
  activeMappings: 0,
  totalMappings: 0,
  connectedDevices: [],
};

export const useAppStore = create<AppStore>((set, get) => ({
  config: null,
  currentProfile: null,
  serviceStatus: initialServiceStatus,
  logs: [],
  loading: false,
  error: null,

  setConfig: (config) => {
    set({ config });
    const { currentProfile } = get();
    if (!currentProfile && config.activeProfileId) {
      const profile = config.profiles.find(p => p.id === config.activeProfileId);
      set({ currentProfile: profile || null });
    }
  },

  updateConfig: (partial) => {
    const { config } = get();
    if (config) {
      const newConfig = { ...config, ...partial };
      set({ config: newConfig });
      if (partial.activeProfileId !== undefined) {
        const profile = newConfig.profiles.find(p => p.id === partial.activeProfileId);
        set({ currentProfile: profile || null });
      }
    }
  },

  setCurrentProfile: (profile) => set({ currentProfile: profile }),

  setServiceStatus: (status) => set({ serviceStatus: status }),

  addLog: (entry) => {
    set((state) => ({
      logs: [...state.logs.slice(-99), entry],
    }));
  },

  clearLogs: () => set({ logs: [] }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const config = await window.api.config.get();
      const status = await window.api.service.getStatus();
      set({ config, serviceStatus: status });
      if (config.activeProfileId) {
        const profile = config.profiles.find(p => p.id === config.activeProfileId);
        set({ currentProfile: profile || null });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '初始化失败' });
    } finally {
      set({ loading: false });
    }
  },
}));

export default useAppStore;
