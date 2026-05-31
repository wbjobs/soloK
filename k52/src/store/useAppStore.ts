import { create } from 'zustand';
import type {
  EdgeDetectionParams,
  HistoryRecord,
  PerformanceMetrics,
  BatchState,
  BatchImageItem,
  BatchResult,
} from '@/types';
import { DEFAULT_PARAMS, DEFAULT_BATCH_STATE } from '@/types';

interface AppState {
  params: EdgeDetectionParams;
  originalImage: HTMLImageElement | null;
  processedThumbnail: string | null;
  compareMode: boolean;
  comparePosition: number;
  isProcessing: boolean;
  performance: PerformanceMetrics;
  history: HistoryRecord[];
  batch: BatchState;
  setParams: (partial: Partial<EdgeDetectionParams>) => void;
  setOriginalImage: (image: HTMLImageElement | null) => void;
  setProcessedThumbnail: (thumb: string | null) => void;
  setCompareMode: (enabled: boolean) => void;
  setComparePosition: (pos: number) => void;
  setIsProcessing: (processing: boolean) => void;
  updatePerformance: (partial: Partial<PerformanceMetrics>) => void;
  setHistory: (records: HistoryRecord[]) => void;
  addHistory: (record: HistoryRecord) => void;
  deleteHistory: (id: number) => void;
  clearHistory: () => void;
  setBatchMode: (enabled: boolean) => void;
  addBatchImages: (images: BatchImageItem[]) => void;
  removeBatchImage: (id: string) => void;
  clearBatchImages: () => void;
  updateBatchImage: (id: string, updates: Partial<BatchImageItem>) => void;
  setBatchParams: (params: EdgeDetectionParams) => void;
  setBatchProcessing: (processing: boolean) => void;
  setBatchCurrentIndex: (index: number) => void;
  addBatchResult: (result: BatchResult) => void;
  clearBatchResults: () => void;
  incrementBatchCompleted: () => void;
  resetBatch: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  params: DEFAULT_PARAMS,
  originalImage: null,
  processedThumbnail: null,
  compareMode: false,
  comparePosition: 0.5,
  isProcessing: false,
  performance: {
    fps: 0,
    gpuMemoryMB: 0,
    processTime: {
      sobel: 0,
      canny: 0,
      laplacian: 0,
    },
    currentProcessTime: 0,
  },
  history: [],
  batch: { ...DEFAULT_BATCH_STATE },

  setParams: (partial) =>
    set((state) => ({
      params: { ...state.params, ...partial },
    })),

  setOriginalImage: (image) =>
    set({
      originalImage: image,
    }),

  setProcessedThumbnail: (thumb) =>
    set({
      processedThumbnail: thumb,
    }),

  setCompareMode: (enabled) =>
    set({
      compareMode: enabled,
    }),

  setComparePosition: (pos) =>
    set({
      comparePosition: pos,
    }),

  setIsProcessing: (processing) =>
    set({
      isProcessing: processing,
    }),

  updatePerformance: (partial) =>
    set((state) => ({
      performance: { ...state.performance, ...partial },
    })),

  setHistory: (records) =>
    set({
      history: records,
    }),

  addHistory: (record) =>
    set((state) => ({
      history: [record, ...state.history],
    })),

  deleteHistory: (id) =>
    set((state) => ({
      history: state.history.filter((record) => record.id !== id),
    })),

  clearHistory: () =>
    set({
      history: [],
    }),

  setBatchMode: (enabled) =>
    set((state) => ({
      batch: { ...state.batch, isBatchMode: enabled },
    })),

  addBatchImages: (images) =>
    set((state) => ({
      batch: {
        ...state.batch,
        images: [...state.batch.images, ...images],
        totalFiles: state.batch.totalFiles + images.length,
      },
    })),

  removeBatchImage: (id) =>
    set((state) => ({
      batch: {
        ...state.batch,
        images: state.batch.images.filter((img) => img.id !== id),
        totalFiles: state.batch.images.filter((img) => img.id !== id).length,
      },
    })),

  clearBatchImages: () =>
    set((state) => ({
      batch: {
        ...state.batch,
        images: [],
        totalFiles: 0,
      },
    })),

  updateBatchImage: (id, updates) =>
    set((state) => ({
      batch: {
        ...state.batch,
        images: state.batch.images.map((img) =>
          img.id === id ? { ...img, ...updates } : img
        ),
      },
    })),

  setBatchParams: (params) =>
    set((state) => ({
      batch: { ...state.batch, params },
    })),

  setBatchProcessing: (processing) =>
    set((state) => ({
      batch: { ...state.batch, isProcessing: processing },
    })),

  setBatchCurrentIndex: (index) =>
    set((state) => ({
      batch: { ...state.batch, currentIndex: index },
    })),

  addBatchResult: (result) =>
    set((state) => ({
      batch: {
        ...state.batch,
        results: [...state.batch.results, result],
      },
    })),

  clearBatchResults: () =>
    set((state) => ({
      batch: { ...state.batch, results: [] },
    })),

  incrementBatchCompleted: () =>
    set((state) => ({
      batch: {
        ...state.batch,
        completedFiles: state.batch.completedFiles + 1,
      },
    })),

  resetBatch: () =>
    set({
      batch: { ...DEFAULT_BATCH_STATE },
    }),
}));
