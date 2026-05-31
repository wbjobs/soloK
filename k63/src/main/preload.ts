import { contextBridge, ipcRenderer } from 'electron'
import type { ImageFile, OCRProgress, RenameResult, RenameHistory, SeriesAlias, CustomRule } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('folder:select') as Promise<string | null>,
  scanFolder: (folderPath: string) => ipcRenderer.invoke('folder:scan', folderPath) as Promise<ImageFile[]>,
  recognizeImages: (files: ImageFile[]) => ipcRenderer.invoke('ocr:recognize', files) as Promise<ImageFile[]>,
  applyRename: (items: ImageFile[], folderPath: string) => ipcRenderer.invoke('rename:apply', items, folderPath) as Promise<RenameResult[]>,
  revertRename: (historyIds: number[]) => ipcRenderer.invoke('rename:revert', historyIds) as Promise<Array<{ id: number; success: boolean; error?: string }>>,
  getHistory: (folderPath: string, limit?: number) => ipcRenderer.invoke('history:get', folderPath, limit) as Promise<RenameHistory[]>,
  getFilePreview: (filePath: string) => ipcRenderer.invoke('file:preview', filePath) as Promise<string | null>,
  onOCRProgress: (callback: (progress: OCRProgress) => void) => {
    ipcRenderer.on('ocr:progress', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('ocr:progress')
  },

  getSeriesAliases: () => ipcRenderer.invoke('aliases:get') as Promise<SeriesAlias[]>,
  addSeriesAlias: (canonicalName: string, aliasName: string) => ipcRenderer.invoke('aliases:add', canonicalName, aliasName) as Promise<number>,
  deleteSeriesAlias: (id: number) => ipcRenderer.invoke('aliases:delete', id) as Promise<boolean>,

  getCustomRules: () => ipcRenderer.invoke('rules:get') as Promise<CustomRule[]>,
  addCustomRule: (ruleType: string, pattern: string, replacement?: string, priority?: number) => ipcRenderer.invoke('rules:add', ruleType, pattern, replacement, priority) as Promise<number>,
  deleteCustomRule: (id: number) => ipcRenderer.invoke('rules:delete', id) as Promise<boolean>,
  toggleCustomRule: (id: number) => ipcRenderer.invoke('rules:toggle', id) as Promise<boolean>,

  addLearningSample: (inputText: string, seriesName: string, chapterNumber?: number, chapterTitle?: string) => ipcRenderer.invoke('learning:add', inputText, seriesName, chapterNumber, chapterTitle) as Promise<boolean>
})
