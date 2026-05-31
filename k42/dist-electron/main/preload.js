import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, } from '../shared/index.js';
const api = {
    midi: {
        getDevices: () => ipcRenderer.invoke(IpcChannel.MIDI_GET_DEVICES),
        connectDevice: (deviceId) => ipcRenderer.invoke(IpcChannel.MIDI_SELECT_DEVICE, deviceId),
        disconnectDevice: (deviceId) => ipcRenderer.invoke('midi:disconnect-device', deviceId),
        startLearn: (timeoutMs, deviceId) => ipcRenderer.invoke(IpcChannel.MIDI_START_LEARN, timeoutMs, deviceId),
        stopLearn: () => ipcRenderer.invoke(IpcChannel.MIDI_STOP_LEARN),
        onMessage: (callback) => {
            ipcRenderer.on(IpcChannel.MIDI_MESSAGE_RECEIVED, (_, message) => callback(message));
        },
        onLearned: (callback) => {
            ipcRenderer.on(IpcChannel.MIDI_LEARNED, (_, message) => callback(message));
        },
        onDeviceConnected: (callback) => {
            ipcRenderer.on('midi:device-connected', (_, device) => callback(device));
        },
        onDeviceDisconnected: (callback) => {
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
        start: () => ipcRenderer.invoke(IpcChannel.SERVICE_START),
        stop: () => ipcRenderer.invoke(IpcChannel.SERVICE_STOP),
        getStatus: () => ipcRenderer.invoke(IpcChannel.SERVICE_STATUS),
        onStatusChanged: (callback) => {
            ipcRenderer.on(IpcChannel.SERVICE_STATUS_CHANGED, (_, status) => callback(status));
        },
        onLog: (callback) => {
            ipcRenderer.on(IpcChannel.LOG_ENTRY, (_, entry) => callback(entry));
        },
        removeAllListeners: () => {
            ipcRenderer.removeAllListeners(IpcChannel.SERVICE_STATUS_CHANGED);
            ipcRenderer.removeAllListeners(IpcChannel.LOG_ENTRY);
        },
    },
    config: {
        get: () => ipcRenderer.invoke(IpcChannel.CONFIG_GET),
        save: (config) => ipcRenderer.invoke(IpcChannel.CONFIG_SAVE, config),
    },
    profile: {
        create: (name) => ipcRenderer.invoke(IpcChannel.PROFILE_CREATE, name),
        delete: (profileId) => ipcRenderer.invoke(IpcChannel.PROFILE_DELETE, profileId),
        update: (profile) => ipcRenderer.invoke(IpcChannel.PROFILE_UPDATE, profile),
        switch: (profileId) => ipcRenderer.invoke(IpcChannel.PROFILE_SWITCH, profileId),
        export: (profileId) => ipcRenderer.invoke(IpcChannel.PROFILE_EXPORT, profileId),
        import: () => ipcRenderer.invoke(IpcChannel.PROFILE_IMPORT),
    },
    mapping: {
        add: (profileId, mapping) => ipcRenderer.invoke(IpcChannel.MAPPING_ADD, profileId, mapping),
        update: (profileId, mapping) => ipcRenderer.invoke(IpcChannel.MAPPING_UPDATE, profileId, mapping),
        delete: (profileId, mappingId) => ipcRenderer.invoke(IpcChannel.MAPPING_DELETE, profileId, mappingId),
    },
    action: {
        test: (action) => ipcRenderer.invoke(IpcChannel.ACTION_TEST, action),
    },
    app: {
        quit: () => ipcRenderer.invoke(IpcChannel.APP_QUIT),
        minimize: () => ipcRenderer.invoke(IpcChannel.APP_MINIMIZE),
    },
};
contextBridge.exposeInMainWorld('api', api);
