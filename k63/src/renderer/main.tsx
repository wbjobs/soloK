import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import type { ImageFile, RenameResult, RenameHistory, OCRProgress, SeriesAlias, CustomRule } from '../shared/types'

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>
      scanFolder: (folderPath: string) => Promise<ImageFile[]>
      recognizeImages: (files: ImageFile[]) => Promise<ImageFile[]>
      applyRename: (items: ImageFile[], folderPath: string) => Promise<RenameResult[]>
      revertRename: (historyIds: number[]) => Promise<Array<{ id: number; success: boolean; error?: string }>>
      getHistory: (folderPath: string, limit?: number) => Promise<RenameHistory[]>
      getFilePreview: (filePath: string) => Promise<string | null>
      onOCRProgress: (callback: (progress: OCRProgress) => void) => () => void
      getSeriesAliases: () => Promise<SeriesAlias[]>
      addSeriesAlias: (canonicalName: string, aliasName: string) => Promise<number>
      deleteSeriesAlias: (id: number) => Promise<boolean>
      getCustomRules: () => Promise<CustomRule[]>
      addCustomRule: (ruleType: string, pattern: string, replacement?: string, priority?: number) => Promise<number>
      deleteCustomRule: (id: number) => Promise<boolean>
      toggleCustomRule: (id: number) => Promise<boolean>
      addLearningSample: (inputText: string, seriesName: string, chapterNumber?: number, chapterTitle?: string) => Promise<boolean>
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
