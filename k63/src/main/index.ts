import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import {
  initDatabase, addRenameRecord, markAsReverted, getHistoryByFolder, getHistoryByIds, closeDatabase,
  getAllSeriesAliases, addSeriesAlias, deleteSeriesAlias,
  getAllCustomRules, addCustomRule, deleteCustomRule, toggleCustomRule
} from './database'
import { initOCR, recognizeImages, terminateOCR } from './ocr'
import { parseComicInfo, generateStandardFileName, learnFromCorrection } from './nlp'
import { scanFolder, renameFile, revertRename, getFileAsBase64 } from './fileManager'
import type { ImageFile, RenameResult } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e293b',
      symbolColor: '#e2e8f0',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#0f172a'
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  initDatabase()
  await initOCR()
  createWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  await terminateOCR()
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('folder:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  
  return result.filePaths[0]
})

ipcMain.handle('folder:scan', async (_, folderPath: string) => {
  return scanFolder(folderPath)
})

ipcMain.handle('ocr:recognize', async (_, imageFiles: ImageFile[]) => {
  const filePaths = imageFiles.map(f => f.filePath)
  const allFileNames = imageFiles.map(f => f.originalName)
  
  const ocrResults = await recognizeImages(filePaths, (current, total, fileName) => {
    mainWindow?.webContents.send('ocr:progress', {
      current,
      total,
      fileName,
      progress: (current / total) * 100
    })
  })
  
  const results: ImageFile[] = imageFiles.map(file => {
    const ocrText = ocrResults.get(file.filePath) || ''
    const info = parseComicInfo(ocrText, file.originalName, allFileNames)
    
    return {
      ...file,
      ocrText,
      seriesName: info.seriesName,
      chapterNumber: info.chapterNumber ?? undefined,
      chapterTitle: info.chapterTitle,
      suggestedName: generateStandardFileName(info, file.extension),
      status: 'completed' as const
    }
  })
  
  return results
})

ipcMain.handle('rename:apply', async (_, items: ImageFile[], folderPath: string) => {
  const results: RenameResult[] = []
  
  for (const item of items) {
    if (!item.suggestedName || !item.selected) {
      continue
    }
    
    const result = renameFile(item.filePath, item.suggestedName)
    
    if (result.success && result.newPath) {
      const historyId = addRenameRecord(
        item.originalName,
        item.suggestedName,
        result.newPath,
        folderPath
      )
      
      results.push({
        success: true,
        id: item.id,
        originalName: item.originalName,
        newName: item.suggestedName,
        historyId
      })
    } else {
      results.push({
        success: false,
        id: item.id,
        originalName: item.originalName,
        newName: item.suggestedName,
        error: result.error
      })
    }
  }
  
  return results
})

ipcMain.handle('rename:revert', async (_, historyIds: number[]) => {
  const results: Array<{ id: number; success: boolean; error?: string }> = []
  const uniqueIds = [...new Set(historyIds)]
  
  for (const id of uniqueIds) {
    const history = getHistoryByIds([id])
    
    if (history.length === 0) {
      results.push({ id, success: false, error: 'History record not found' })
      continue
    }
    
    const record = history[0]
    
    if (record.isReverted) {
      results.push({ id, success: false, error: 'Already reverted' })
      continue
    }
    
    const result = revertRename(record.filePath, record.originalName)
    
    if (result.success) {
      markAsReverted(id)
      results.push({ id, success: true })
    } else {
      results.push({ id, success: false, error: result.error })
    }
  }
  
  return results
})

ipcMain.handle('history:get', async (_, folderPath: string, limit?: number) => {
  return getHistoryByFolder(folderPath, limit)
})

ipcMain.handle('file:preview', async (_, filePath: string) => {
  return getFileAsBase64(filePath)
})

ipcMain.handle('aliases:get', async () => {
  return getAllSeriesAliases()
})

ipcMain.handle('aliases:add', async (_, canonicalName: string, aliasName: string) => {
  return addSeriesAlias(canonicalName, aliasName)
})

ipcMain.handle('aliases:delete', async (_, id: number) => {
  deleteSeriesAlias(id)
  return true
})

ipcMain.handle('rules:get', async () => {
  return getAllCustomRules()
})

ipcMain.handle('rules:add', async (_, ruleType: string, pattern: string, replacement?: string, priority?: number) => {
  return addCustomRule(ruleType, pattern, replacement, priority)
})

ipcMain.handle('rules:delete', async (_, id: number) => {
  deleteCustomRule(id)
  return true
})

ipcMain.handle('rules:toggle', async (_, id: number) => {
  toggleCustomRule(id)
  return true
})

ipcMain.handle('learning:add', async (_, inputText: string, seriesName: string, chapterNumber?: number, chapterTitle?: string) => {
  learnFromCorrection(inputText, seriesName, chapterNumber, chapterTitle)
  return true
})
