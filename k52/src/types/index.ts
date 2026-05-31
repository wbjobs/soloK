export type Algorithm = 'sobel' | 'canny' | 'laplacian';

export type KernelSize = 3 | 5 | 7;

export interface EdgeDetectionParams {
  algorithm: Algorithm;
  kernelSize: KernelSize;
  lowThreshold: number;
  highThreshold: number;
  intensity: number;
  grayscale: boolean;
}

export interface HistoryRecord {
  id?: number;
  algorithm: Algorithm;
  thumbnail: string;
  parameters: EdgeDetectionParams;
  timestamp: number;
  imageWidth: number;
  imageHeight: number;
  originalImage?: string;
}

export interface PerformanceMetrics {
  fps: number;
  gpuMemoryMB: number;
  processTime: {
    sobel: number;
    canny: number;
    laplacian: number;
  };
  currentProcessTime: number;
}

export interface WebGLStats {
  textures: number;
  framebuffers: number;
  programs: number;
}

export const DEFAULT_PARAMS: EdgeDetectionParams = {
  algorithm: 'sobel',
  kernelSize: 3,
  lowThreshold: 50,
  highThreshold: 150,
  intensity: 1.0,
  grayscale: true,
};

export const ALGORITHM_INFO: Record<Algorithm, { name: string; description: string }> = {
  sobel: {
    name: 'Sobel 算子',
    description: '计算水平和垂直方向的梯度，对噪声有一定抑制能力，边缘检测速度快。',
  },
  canny: {
    name: 'Canny 边缘检测',
    description: '多阶段算法：高斯模糊→梯度计算→非极大值抑制→双阈值检测，边缘定位精准。',
  },
  laplacian: {
    name: 'Laplacian 算子',
    description: '二阶导数算子，检测零交叉点，对噪声非常敏感，适合检测细边缘。',
  },
};

export interface BatchImageItem {
  id: string;
  file: File;
  name: string;
  image: HTMLImageElement | null;
  width: number;
  height: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  results: {
    [key in Algorithm]?: {
      processTime: number;
      outputDataUrl: string;
    };
  };
}

export interface BatchResult {
  imageName: string;
  imageWidth: number;
  imageHeight: number;
  algorithm: Algorithm;
  processTimeMs: number;
  parameters: EdgeDetectionParams;
  timestamp: number;
}

export interface BatchState {
  isBatchMode: boolean;
  images: BatchImageItem[];
  currentIndex: number;
  isProcessing: boolean;
  results: BatchResult[];
  params: EdgeDetectionParams;
  totalFiles: number;
  completedFiles: number;
}

export const BATCH_MAX_IMAGES = 10;

export const DEFAULT_BATCH_STATE: BatchState = {
  isBatchMode: false,
  images: [],
  currentIndex: 0,
  isProcessing: false,
  results: [],
  params: { ...DEFAULT_PARAMS },
  totalFiles: 0,
  completedFiles: 0,
};
