import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannel,
  MidiMessage,
  MidiDevice,
  MappingRule,
  Profile,
  AppConfig,
  Action,
  ServiceStatus,
  LogEntry,
} from '../shared/index.js';

const api = {
  midi: {
    getDevices: (): Promise<MidiDevice[]> =>
      ipcRenderer.invoke(IpcChannel.MIDI_GET_DEVICES),
    connectDevice: (deviceId: string | null): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.MIDI_SELECT_DEVICE, deviceId),
    disconnectDevice: (deviceId: string): Promise<boolean> =>
      ipcRenderer.invoke('midi:disconnect-device', deviceId),
    startLearn: (timeoutMs?: number, deviceId?: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.MIDI_START_LEARN, timeoutMs, deviceId),
    stopLearn: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.MIDI_STOP_LEARN),
    onMessage: (callback: (message: MidiMessage) => void) => {
      ipcRenderer.on(IpcChannel.MIDI_MESSAGE_RECEIVED, (_, message) => callback(message));
    },
    onLearned: (callback: (message: MidiMessage) => void) => {
      ipcRenderer.on(IpcChannel.MIDI_LEARNED, (_, message) => callback(message));
    },
    onDeviceConnected: (callback: (device: MidiDevice) => void) => {
      ipcRenderer.on('midi:device-connected', (_, device) => callback(device));
    },
    onDeviceDisconnected: (callback: (deviceId: string) => void) => {
      ipcRenderer.on('midi:device-disconnected', (_, deviceId) => callback(deviceId));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners(IpcChannel.MIDI_MESSAGE_RECEIVED);
      ipcRenderer.removeAllListeners(IpcChannel.MIDI_LEARNED);
      ipcRenderer.removeAllListeners('midi:device-connected');
      ipcRenderer.removeAllListeners('midi:device-disconnected');
    },
  },

  service: {
    start: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.SERVICE_START),
    stop: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.SERVICE_STOP),
    getStatus: (): Promise<ServiceStatus> =>
      ipcRenderer.invoke(IpcChannel.SERVICE_STATUS),
    onStatusChanged: (callback: (status: ServiceStatus) => void) => {
      ipcRenderer.on(IpcChannel.SERVICE_STATUS_CHANGED, (_, status) => callback(status));
    },
    onLog: (callback: (entry: LogEntry) => void) => {
      ipcRenderer.on(IpcChannel.LOG_ENTRY, (_, entry) => callback(entry));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners(IpcChannel.SERVICE_STATUS_CHANGED);
      ipcRenderer.removeAllListeners(IpcChannel.LOG_ENTRY);
    },
  },

  config: {
    get: (): Promise<AppConfig> =>
      ipcRenderer.invoke(IpcChannel.CONFIG_GET),
    save: (config: Partial<AppConfig>): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.CONFIG_SAVE, config),
  },

  profile: {
    create: (name: string): Promise<Profile | null> =>
      ipcRenderer.invoke(IpcChannel.PROFILE_CREATE, name),
    delete: (profileId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.PROFILE_DELETE, profileId),
    update: (profile: Profile): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.PROFILE_UPDATE, profile),
    switch: (profileId: string | null): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.PROFILE_SWITCH, profileId),
    export: (profileId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.PROFILE_EXPORT, profileId),
    import: (): Promise<Profile | null> =>
      ipcRenderer.invoke(IpcChannel.PROFILE_IMPORT),
  },

  mapping: {
    add: (profileId: string, mapping: MappingRule): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.MAPPING_ADD, profileId, mapping),
    update: (profileId: string, mapping: MappingRule): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.MAPPING_UPDATE, profileId, mapping),
    delete: (profileId: string, mappingId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.MAPPING_DELETE, profileId, mappingId),
  },

  action: {
    test: (action: Action): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.ACTION_TEST, action),
  },

  app: {
    quit: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.APP_QUIT),
    minimize: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.APP_MINIMIZE),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
