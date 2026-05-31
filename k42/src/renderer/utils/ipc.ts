import type { IpcChannel } from '@shared/index';
import type {
  MidiDevice,
  MidiMessage,
  AppConfig,
  Profile,
  MappingRule,
  Action,
  ServiceStatus,
  LogEntry,
} from '@shared/index';

export const ipcMidi = {
  getDevices: (): Promise<MidiDevice[]> =>
    window.api.midi.getDevices(),

  connectDevice: (deviceId: string | null): Promise<boolean> =>
    window.api.midi.connectDevice(deviceId),

  disconnectDevice: (deviceId: string): Promise<boolean> =>
    window.api.midi.disconnectDevice(deviceId),

  startLearn: (timeoutMs?: number): Promise<void> =>
    window.api.midi.startLearn(timeoutMs),

  stopLearn: (): Promise<void> =>
    window.api.midi.stopLearn(),

  onMessage: (callback: (message: MidiMessage) => void): void =>
    window.api.midi.onMessage(callback),

  onLearned: (callback: (message: MidiMessage) => void): void =>
    window.api.midi.onLearned(callback),

  removeAllListeners: (): void =>
    window.api.midi.removeAllListeners(),
};

export const ipcService = {
  start: (): Promise<boolean> =>
    window.api.service.start(),

  stop: (): Promise<boolean> =>
    window.api.service.stop(),

  getStatus: (): Promise<ServiceStatus> =>
    window.api.service.getStatus(),

  onStatusChanged: (callback: (status: ServiceStatus) => void): void =>
    window.api.service.onStatusChanged(callback),

  onLog: (callback: (entry: LogEntry) => void): void =>
    window.api.service.onLog(callback),

  removeAllListeners: (): void =>
    window.api.service.removeAllListeners(),
};

export const ipcConfig = {
  get: (): Promise<AppConfig> =>
    window.api.config.get(),

  save: (config: Partial<AppConfig>): Promise<boolean> =>
    window.api.config.save(config),
};

export const ipcProfile = {
  create: (name: string): Promise<Profile | null> =>
    window.api.profile.create(name),

  delete: (profileId: string): Promise<boolean> =>
    window.api.profile.delete(profileId),

  update: (profile: Profile): Promise<boolean> =>
    window.api.profile.update(profile),

  switch: (profileId: string | null): Promise<boolean> =>
    window.api.profile.switch(profileId),

  export: (profileId: string): Promise<boolean> =>
    window.api.profile.export(profileId),

  import: (): Promise<Profile | null> =>
    window.api.profile.import(),
};

export const ipcMapping = {
  add: (profileId: string, mapping: MappingRule): Promise<boolean> =>
    window.api.mapping.add(profileId, mapping),

  update: (profileId: string, mapping: MappingRule): Promise<boolean> =>
    window.api.mapping.update(profileId, mapping),

  delete: (profileId: string, mappingId: string): Promise<boolean> =>
    window.api.mapping.delete(profileId, mappingId),
};

export const ipcAction = {
  test: (action: Action): Promise<boolean> =>
    window.api.action.test(action),
};

export const ipcApp = {
  quit: (): Promise<void> =>
    window.api.app.quit(),

  minimize: (): Promise<void> =>
    window.api.app.minimize(),
};

export const ipc = {
  midi: ipcMidi,
  service: ipcService,
  config: ipcConfig,
  profile: ipcProfile,
  mapping: ipcMapping,
  action: ipcAction,
  app: ipcApp,
};

export default ipc;
