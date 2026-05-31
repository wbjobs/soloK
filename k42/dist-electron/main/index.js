import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DeviceManager } from './midi/DeviceManager.js';
import { MidiListener } from './midi/MidiListener.js';
import { MidiAdapter } from './midi/MidiAdapter.js';
import { InputSimulator } from './input/InputSimulator.js';
import { InputSimulatorAdapter } from './input/InputSimulatorAdapter.js';
import { ConfigManager } from './config/ConfigManager.js';
import { ProfileManager } from './config/ProfileManager.js';
import { BackgroundService } from './service/BackgroundService.js';
import { setupIpcHandlers } from './ipc/handlers.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, '../..');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT, 'public')
    : RENDERER_DIST;
let mainWindow = null;
let tray = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0f0f1a',
        frame: false,
        titleBarStyle: 'hidden',
        icon: path.join(process.env.VITE_PUBLIC || RENDERER_DIST, 'favicon.svg'),
        webPreferences: {
            preload: path.join(MAIN_DIST, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    if (VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    return mainWindow;
}
function createTray() {
    const iconPath = path.join(process.env.VITE_PUBLIC || RENDERER_DIST, 'favicon.svg');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        {
            label: '退出',
            click: () => {
                app.quit();
            },
        },
    ]);
    tray.setToolTip('MIDI Mapper');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            }
            else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}
app.whenReady().then(async () => {
    const window = createWindow();
    const configManager = ConfigManager.getInstance();
    const profileManager = ProfileManager.getInstance(configManager);
    const deviceManager = new DeviceManager();
    const midiListener = new MidiListener();
    const midiAdapter = new MidiAdapter(deviceManager, midiListener);
    const inputSimulator = new InputSimulator();
    const inputSimulatorAdapter = new InputSimulatorAdapter(inputSimulator);
    const backgroundService = BackgroundService.getInstance({
        midiAdapter,
        inputSimulator: inputSimulatorAdapter,
        profileManager,
        configManager,
    });
    await configManager.load();
    deviceManager.startMonitoring();
    setupIpcHandlers(deviceManager, midiListener, midiAdapter, backgroundService, configManager, profileManager, inputSimulatorAdapter, window);
    try {
        createTray();
    }
    catch {
        // Tray creation may fail on some systems, ignore
    }
    const scriptEngine = backgroundService.getScriptEngine();
    scriptEngine.setInputSimulator(inputSimulatorAdapter);
    const config = configManager.getConfig();
    if (config.startServiceOnLaunch && config.connectedDeviceIds && config.connectedDeviceIds.length > 0) {
        try {
            await backgroundService.start();
        }
        catch {
            // Ignore startup errors
        }
    }
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Don't quit, keep running in tray
    }
});
app.on('before-quit', async () => {
    const configManager = ConfigManager.getInstance();
    if (configManager) {
        await configManager.save();
    }
});
