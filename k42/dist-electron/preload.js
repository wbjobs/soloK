import { contextBridge as t, ipcRenderer as i } from "electron";
var E = /* @__PURE__ */ ((e) => (e.MIDI_GET_DEVICES = "midi:get-devices", e.MIDI_SELECT_DEVICE = "midi:select-device", e.MIDI_START_LEARN = "midi:start-learn", e.MIDI_STOP_LEARN = "midi:stop-learn", e.MIDI_MESSAGE_RECEIVED = "midi:message-received", e.MIDI_LEARNED = "midi:learned", e.SERVICE_START = "service:start", e.SERVICE_STOP = "service:stop", e.SERVICE_STATUS = "service:status", e.SERVICE_STATUS_CHANGED = "service:status-changed", e.CONFIG_GET = "config:get", e.CONFIG_SAVE = "config:save", e.PROFILE_CREATE = "profile:create", e.PROFILE_DELETE = "profile:delete", e.PROFILE_UPDATE = "profile:update", e.PROFILE_SWITCH = "profile:switch", e.PROFILE_EXPORT = "profile:export", e.PROFILE_IMPORT = "profile:import", e.MAPPING_ADD = "mapping:add", e.MAPPING_UPDATE = "mapping:update", e.MAPPING_DELETE = "mapping:delete", e.ACTION_TEST = "action:test", e.LOG_ENTRY = "log:entry", e.APP_QUIT = "app:quit", e.APP_MINIMIZE = "app:minimize", e))(E || {});
const I = {
  midi: {
    getDevices: () => i.invoke(E.MIDI_GET_DEVICES),
    connectDevice: (e) => i.invoke(E.MIDI_SELECT_DEVICE, e),
    disconnectDevice: (e) => i.invoke("midi:disconnect-device", e),
    startLearn: (e, o) => i.invoke(E.MIDI_START_LEARN, e, o),
    stopLearn: () => i.invoke(E.MIDI_STOP_LEARN),
    onMessage: (e) => {
      i.on(E.MIDI_MESSAGE_RECEIVED, (o, _) => e(_));
    },
    onLearned: (e) => {
      i.on(E.MIDI_LEARNED, (o, _) => e(_));
    },
    onDeviceConnected: (e) => {
      i.on("midi:device-connected", (o, _) => e(_));
    },
    onDeviceDisconnected: (e) => {
      i.on("midi:device-disconnected", (o, _) => e(_));
    },
    removeAllListeners: () => {
      i.removeAllListeners(E.MIDI_MESSAGE_RECEIVED), i.removeAllListeners(E.MIDI_LEARNED), i.removeAllListeners("midi:device-connected"), i.removeAllListeners("midi:device-disconnected");
    }
  },
  service: {
    start: () => i.invoke(E.SERVICE_START),
    stop: () => i.invoke(E.SERVICE_STOP),
    getStatus: () => i.invoke(E.SERVICE_STATUS),
    onStatusChanged: (e) => {
      i.on(E.SERVICE_STATUS_CHANGED, (o, _) => e(_));
    },
    onLog: (e) => {
      i.on(E.LOG_ENTRY, (o, _) => e(_));
    },
    removeAllListeners: () => {
      i.removeAllListeners(E.SERVICE_STATUS_CHANGED), i.removeAllListeners(E.LOG_ENTRY);
    }
  },
  config: {
    get: () => i.invoke(E.CONFIG_GET),
    save: (e) => i.invoke(E.CONFIG_SAVE, e)
  },
  profile: {
    create: (e) => i.invoke(E.PROFILE_CREATE, e),
    delete: (e) => i.invoke(E.PROFILE_DELETE, e),
    update: (e) => i.invoke(E.PROFILE_UPDATE, e),
    switch: (e) => i.invoke(E.PROFILE_SWITCH, e),
    export: (e) => i.invoke(E.PROFILE_EXPORT, e),
    import: () => i.invoke(E.PROFILE_IMPORT)
  },
  mapping: {
    add: (e, o) => i.invoke(E.MAPPING_ADD, e, o),
    update: (e, o) => i.invoke(E.MAPPING_UPDATE, e, o),
    delete: (e, o) => i.invoke(E.MAPPING_DELETE, e, o)
  },
  action: {
    test: (e) => i.invoke(E.ACTION_TEST, e)
  },
  app: {
    quit: () => i.invoke(E.APP_QUIT),
    minimize: () => i.invoke(E.APP_MINIMIZE)
  }
};
t.exposeInMainWorld("api", I);
