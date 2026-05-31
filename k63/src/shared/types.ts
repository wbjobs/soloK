export interface ImageFile {
  id: string
  originalName: string
  filePath: string
  fileSize: number
  extension: string
  ocrText?: string
  suggestedName?: string
  seriesName?: string
  chapterNumber?: number
  chapterTitle?: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  selected: boolean
  userCorrected?: boolean
}

export interface RenameHistory {
  id: number
  originalName: string
  newName: string
  filePath: string
  folderPath: string
  createdAt: string
  isReverted: boolean
}

export interface OCRProgress {
  current: number
  total: number
  fileName: string
  progress: number
}

export interface RenameResult {
  success: boolean
  id: string
  originalName: string
  newName: string
  error?: string
  historyId?: number
}

export interface SeriesAlias {
  id: number
  canonicalName: string
  aliasName: string
}

export interface CustomRule {
  id: number
  ruleType: 'series' | 'chapter' | 'title' | 'replace'
  pattern: string
  replacement?: string
  priority: number
  enabled: boolean
}

export interface LearningSample {
  id: number
  inputText: string
  seriesName: string
  chapterNumber?: number
  chapterTitle?: string
  correctedByUser: boolean
  createdAt: string
  useCount: number
}
