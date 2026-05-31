import axios from 'axios';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000,
});

export interface ClassificationResult {
  class_id: number;
  class_name: string;
  confidence: number;
  severity?: number;
  probabilities: number[];
}

export interface BandContribution {
  index: number;
  wavelength: number;
  importance: number;
}

export interface GradCAMResult {
  success: boolean;
  predicted_class: number;
  class_name: string;
  probability: number;
  cam: number[];
  cam_upsampled: number[];
  top_bands: BandContribution[];
  most_important_band: BandContribution;
}

export interface SpectralMatchResult {
  disease_name: string;
  severity: number;
  crop_type: string;
  description: string;
  similarity: number;
  method: string;
  spectrum: number[];
}

export interface VIResult {
  name: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  description: string;
  values?: number[][];
}

export interface SmallLesion {
  id: number;
  center: [number, number];
  area_pixels: number;
  area_ratio: number;
  mean_severity: number;
  max_severity: number;
  dominant_class: number;
  bbox: [number, number, number, number];
}

export const classifySpectrum = async (
  spectrum: number[],
  wavelengths?: number[],
  preprocess: boolean = true
) => {
  const response = await api.post('/classify', {
    spectrum,
    wavelengths,
    preprocess,
  });
  return response.data;
};

export const analyzeGradCAM = async (
  spectrum: number[],
  wavelengths?: number[],
  targetClass?: number
): Promise<GradCAMResult> => {
  const response = await api.post('/grad-cam', {
    spectrum,
    wavelengths,
    target_class: targetClass,
  });
  return response.data;
};

export const searchSpectralLibrary = async (
  spectrum: number[],
  method: string = 'spectral_angle',
  topK: number = 5,
  preprocess: boolean = true
): Promise<{ success: boolean; results: SpectralMatchResult[] }> => {
  const response = await api.post('/spectral-search', {
    spectrum,
    method,
    top_k: topK,
    preprocess,
  });
  return response.data;
};

export const getDiseaseList = async () => {
  const response = await api.get('/spectral-library/diseases');
  return response.data;
};

export const getDiseaseSignature = async (diseaseName: string) => {
  const response = await api.get(`/spectral-library/signature/${diseaseName}`);
  return response.data;
};

export const uploadHypercube = async (
  hdrFile: File,
  datFile?: File
) => {
  const formData = new FormData();
  formData.append('hdr_file', hdrFile);
  if (datFile) {
    formData.append('dat_file', datFile);
  }
  
  const response = await api.post('/upload-hypercube', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const calculateVI = async (
  hypercubeId: string,
  indexNames: string[] = ['NDVI', 'PRI', 'PSRI', 'CCCI']
) => {
  const response = await api.post('/calculate-vi', {
    hypercube_id: hypercubeId,
    index_names: indexNames,
  });
  return response.data;
};

export interface DiseaseDistributionResponse {
  success: boolean;
  distribution: Record<string, number>;
  severity_mean: number;
  heatmap: number[][];
  geojson?: any;
  small_lesions?: SmallLesion[];
}

export const getDiseaseDistribution = async (hypercubeId: string): Promise<DiseaseDistributionResponse> => {
  const response = await api.get(`/disease-distribution/${hypercubeId}`);
  return response.data;
};

export const getMeanSpectrum = async (hypercubeId: string) => {
  const response = await api.get(`/spectrum/${hypercubeId}`);
  return response.data;
};

export const getRgbPreview = async (hypercubeId: string) => {
  const response = await api.get(`/rgb-preview/${hypercubeId}`);
  return response.data;
};

export const generatePrescription = async (
  fieldId: string,
  severityMap: number[][],
  fertilizerTypes: string[] = ['氮肥', '磷肥', '钾肥'],
  baseRate: number = 100
) => {
  const response = await api.post('/prescription', {
    field_id: fieldId,
    severity_map: severityMap,
    fertilizer_types: fertilizerTypes,
    base_rate: baseRate,
  });
  return response.data;
};

export const detectChanges = async (
  hypercube1Id: string,
  hypercube2Id: string,
  indexName: string = 'NDVI'
) => {
  const response = await api.post('/change-detection', {
    hypercube1_id: hypercube1Id,
    hypercube2_id: hypercube2Id,
    index_name: indexName,
  });
  return response.data;
};

export default api;
