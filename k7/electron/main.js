const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow = null;
let pythonProcess = null;
let pythonReady = false;
let isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '古琴减字谱识别与打谱编辑器',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    backgroundColor: '#1a1a2e',
    show: false
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startPythonBackend() {
  const pythonPath = isDev
    ? 'python'
    : path.join(process.resourcesPath, 'python', 'python.exe');

  const scriptPath = isDev
    ? path.join(__dirname, '..', 'python', 'app.py')
    : path.join(process.resourcesPath, 'python', 'app.py');

  const pythonDir = path.dirname(scriptPath);

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8'
  };

  try {
    pythonProcess = spawn(pythonPath, [scriptPath], {
      cwd: pythonDir,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Python]', output);
      if (output.includes('Uvicorn running') || output.includes('Application startup')) {
        pythonReady = true;
        if (mainWindow) {
          mainWindow.webContents.send('python-ready');
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('[Python Error]', data.toString());
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      pythonReady = false;
      if (mainWindow) {
        mainWindow.webContents.send('python-disconnected');
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python backend:', err);
      if (mainWindow) {
        mainWindow.webContents.send('python-error', err.message);
      }
    });
  } catch (err) {
    console.error('Error starting Python backend:', err);
  }
}

function stopPythonBackend() {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
    pythonReady = false;
  }
}

app.whenReady().then(() => {
  createWindow();
  startPythonBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
});

ipcMain.handle('get-python-status', () => {
  return { ready: pythonReady, pid: pythonProcess ? pythonProcess.pid : null };
});

ipcMain.handle('get-app-path', () => {
  return {
    userData: app.getPath('userData'),
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath || path.join(__dirname, '..')
  };
});

ipcMain.handle('open-file-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options || {
    title: '选择古琴减字谱图片',
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  return result;
});

ipcMain.handle('save-file-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options || {
    title: '保存文件',
    filters: [
      { name: 'MIDI', extensions: ['mid', 'midi'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return { success: true, data: data.toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, data, encoding) => {
  try {
    const buffer = encoding === 'base64'
      ? Buffer.from(data, 'base64')
      : Buffer.from(data, encoding || 'utf-8');
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-temp-path', () => {
  return os.tmpdir();
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options || {
    type: 'info',
    buttons: ['OK'],
    title: '提示',
    message: ''
  });
  return result;
});
