import { ipcMain, dialog } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import { IpcChannel, } from '../../shared/index.js';
export function setupIpcHandlers(deviceManager, midiListener, midiAdapter, backgroundService, configManager, profileManager, inputSimulatorAdapter, mainWindow) {
    ipcMain.handle(IpcChannel.MIDI_GET_DEVICES, async () => {
        try {
            return deviceManager.getDevices();
        }
        catch {
            return [];
        }
    });
    ipcMain.handle(IpcChannel.MIDI_SELECT_DEVICE, async (_, deviceId) => {
        try {
            if (deviceId === null) {
                await midiAdapter.disconnectAll();
                const config = configManager.getConfig();
                await configManager.updateConfig({ ...config, connectedDeviceIds: [] });
                return true;
            }
            const success = await backgroundService.connectMidiDevice(deviceId);
            if (success) {
                const config = configManager.getConfig();
                const connectedDeviceIds = [...(config.connectedDeviceIds || []), deviceId];
                await configManager.updateConfig({ ...config, connectedDeviceIds });
            }
            return success;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle('midi:disconnect-device', async (_, deviceId) => {
        try {
            await backgroundService.disconnectMidiDevice(deviceId);
            const config = configManager.getConfig();
            const connectedDeviceIds = (config.connectedDeviceIds || []).filter((id) => id !== deviceId);
            await configManager.updateConfig({ ...config, connectedDeviceIds });
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.MIDI_START_LEARN, async (_, timeoutMs = 10000, deviceId) => {
        midiAdapter.startLearn(timeoutMs, deviceId);
    });
    ipcMain.handle(IpcChannel.MIDI_STOP_LEARN, async () => {
        midiAdapter.stopLearn();
    });
    midiListener.on('message', (message) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IpcChannel.MIDI_MESSAGE_RECEIVED, message);
        }
    });
    midiListener.on('learned', (message) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IpcChannel.MIDI_LEARNED, message);
        }
    });
    midiListener.on('device-connected', (device) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('midi:device-connected', device);
        }
    });
    midiListener.on('device-disconnected', (deviceId) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('midi:device-disconnected', deviceId);
        }
    });
    ipcMain.handle(IpcChannel.SERVICE_START, async () => {
        try {
            await backgroundService.start();
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.SERVICE_STOP, async () => {
        try {
            await backgroundService.stop();
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.SERVICE_STATUS, async () => {
        return backgroundService.getStatus();
    });
    backgroundService.on('service:status-changed', (_, status) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IpcChannel.SERVICE_STATUS_CHANGED, status);
        }
    });
    backgroundService.on('log:entry', (_, entry) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IpcChannel.LOG_ENTRY, entry);
        }
    });
    ipcMain.handle(IpcChannel.CONFIG_GET, async () => {
        return configManager.getConfig();
    });
    ipcMain.handle(IpcChannel.CONFIG_SAVE, async (_, config) => {
        try {
            await configManager.updateConfig(config);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.PROFILE_CREATE, async (_, name) => {
        try {
            return await profileManager.createProfile({ name });
        }
        catch {
            return null;
        }
    });
    ipcMain.handle(IpcChannel.PROFILE_DELETE, async (_, profileId) => {
        try {
            await profileManager.deleteProfile(profileId);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.PROFILE_UPDATE, async (_, profileId, profile) => {
        try {
            await profileManager.updateProfile(profileId, profile);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.PROFILE_SWITCH, async (_, profileId) => {
        try {
            await profileManager.switchProfile(profileId);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.PROFILE_EXPORT, async (_, profileId) => {
        try {
            const profile = profileManager.getProfile(profileId);
            if (!profile)
                return false;
            const result = await dialog.showSaveDialog(mainWindow, {
                title: '导出配置文件',
                defaultPath: `${profile.name}.json`,
                filters: [{ name: 'JSON文件', extensions: ['json'] }],
            });
            if (result.canceled || !result.filePath)
                return false;
            const exportData = {
                version: '1.0',
                exportedAt: Date.now(),
                profile,
            };
            await writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8');
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.PROFILE_IMPORT, async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: '导入配置文件',
                filters: [{ name: 'JSON文件', extensions: ['json'] }],
                properties: ['openFile'],
            });
            if (result.canceled || result.filePaths.length === 0)
                return null;
            const content = await readFile(result.filePaths[0], 'utf-8');
            const data = JSON.parse(content);
            const profile = data.profile || data;
            const importResult = await profileManager.importProfile(profile);
            return importResult.success ? importResult.profile : null;
        }
        catch {
            return null;
        }
    });
    ipcMain.handle(IpcChannel.MAPPING_ADD, async (_, profileId, mapping) => {
        try {
            await profileManager.addMapping(profileId, mapping);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.MAPPING_UPDATE, async (_, profileId, mappingId, mapping) => {
        try {
            await profileManager.updateMapping(profileId, mappingId, mapping);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.MAPPING_DELETE, async (_, profileId, mappingId) => {
        try {
            await profileManager.deleteMapping(profileId, mappingId);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.ACTION_TEST, async (_, action) => {
        try {
            await inputSimulatorAdapter.testAction(action);
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle(IpcChannel.APP_QUIT, async () => {
        try {
            await backgroundService.stop();
        }
        catch {
            // Ignore stop errors
        }
        midiListener.disconnect();
        deviceManager.stopMonitoring();
        try {
            await configManager.save();
        }
        catch {
            // Ignore save errors
        }
    });
    ipcMain.handle(IpcChannel.APP_MINIMIZE, async () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });
}
