const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPythonStatus: () => ipcRenderer.invoke('get-python-status'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data, encoding) => ipcRenderer.invoke('write-file', filePath, data, encoding),
  getTempPath: () => ipcRenderer.invoke('get-temp-path'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),

  onPythonReady: (callback) => {
    ipcRenderer.on('python-ready', callback);
    return () => ipcRenderer.removeListener('python-ready', callback);
  },
  onPythonDisconnected: (callback) => {
    ipcRenderer.on('python-disconnected', callback);
    return () => ipcRenderer.removeListener('python-disconnected', callback);
  },
  onPythonError: (callback) => {
    ipcRenderer.on('python-error', callback);
    return () => ipcRenderer.removeListener('python-error', callback);
  }
});
