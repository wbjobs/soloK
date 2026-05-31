import { create } from 'zustand'
import type { ImageFile, RenameHistory, OCRProgress } from '../../shared/types'

interface AppState {
  folderPath: string | null
  imageFiles: ImageFile[]
  selectedImageId: string | null
  isProcessing: boolean
  ocrProgress: OCRProgress | null
  history: RenameHistory[]
  selectedHistoryIds: number[]
  viewMode: 'list' | 'grid'
  showHistory: boolean
  
  setFolderPath: (path: string | null) => void
  setImageFiles: (files: ImageFile[]) => void
  setSelectedImageId: (id: string | null) => void
  setIsProcessing: (processing: boolean) => void
  setOcrProgress: (progress: OCRProgress | null) => void
  setHistory: (history: RenameHistory[]) => void
  toggleHistorySelection: (id: number) => void
  selectAllHistory: () => void
  clearHistorySelection: () => void
  toggleImageSelection: (id: string) => void
  selectAllImages: () => void
  clearImageSelection: () => void
  updateSuggestedName: (id: string, name: string) => void
  setViewMode: (mode: 'list' | 'grid') => void
  toggleShowHistory: () => void
  resetState: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  folderPath: null,
  imageFiles: [],
  selectedImageId: null,
  isProcessing: false,
  ocrProgress: null,
  history: [],
  selectedHistoryIds: [],
  viewMode: 'list',
  showHistory: false,

  setFolderPath: (path) => set({ folderPath: path }),
  setImageFiles: (files) => set({ imageFiles: files }),
  setSelectedImageId: (id) => set({ selectedImageId: id }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  setOcrProgress: (progress) => set({ ocrProgress: progress }),
  setHistory: (history) => set({ history }),

  toggleHistorySelection: (id) => {
    const { selectedHistoryIds } = get()
    if (selectedHistoryIds.includes(id)) {
      set({ selectedHistoryIds: selectedHistoryIds.filter(i => i !== id) })
    } else {
      set({ selectedHistoryIds: [...selectedHistoryIds, id] })
    }
  },

  selectAllHistory: () => {
    const { history } = get()
    set({ selectedHistoryIds: history.filter(h => !h.isReverted).map(h => h.id) })
  },

  clearHistorySelection: () => set({ selectedHistoryIds: [] }),

  toggleImageSelection: (id) => {
    const { imageFiles } = get()
    set({
      imageFiles: imageFiles.map(f =>
        f.id === id ? { ...f, selected: !f.selected } : f
      )
    })
  },

  selectAllImages: () => {
    const { imageFiles } = get()
    set({
      imageFiles: imageFiles.map(f => ({ ...f, selected: true }))
    })
  },

  clearImageSelection: () => {
    const { imageFiles } = get()
    set({
      imageFiles: imageFiles.map(f => ({ ...f, selected: false }))
    })
  },

  updateSuggestedName: (id, name) => {
    const { imageFiles } = get()
    set({
      imageFiles: imageFiles.map(f =>
        f.id === id ? { ...f, suggestedName: name } : f
      )
    })
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleShowHistory: () => set({ showHistory: !get().showHistory }),

  resetState: () => set({
    folderPath: null,
    imageFiles: [],
    selectedImageId: null,
    isProcessing: false,
    ocrProgress: null,
    history: [],
    selectedHistoryIds: []
  })
}))
