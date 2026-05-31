import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);

export const checkPythonStatus = async () => {
  if (window.electronAPI) {
    return window.electronAPI.getPythonStatus();
  }
  try {
    await api.get('/health');
    return { ready: true, pid: null };
  } catch {
    return { ready: false, pid: null };
  }
};

export const uploadImage = async (filePath) => {
  const formData = new FormData();
  formData.append('file', {
    uri: filePath,
    type: 'image/jpeg',
    name: 'notation.jpg'
  });
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

export const uploadImageData = async (imageData) => {
  return api.post('/upload-base64', { image: imageData });
};

export const processImage = async (imageId, options = {}) => {
  return api.post('/process', {
    image_id: imageId,
    preprocess: options.preprocess !== false,
    ocr: options.ocr !== false,
    extract: options.extract !== false
  });
};

export const recognizeNotation = async (imageData) => {
  return api.post('/recognize', {
    image: imageData
  });
};

export const getNotationResult = async (taskId) => {
  return api.get(`/result/${taskId}`);
};

export const generateMidi = async (notationData, options = {}) => {
  return api.post('/generate-midi', {
    notation: notationData,
    tempo: options.tempo || 60,
    sound_type: options.soundType || 'anxian'
  });
};

export const exportScorePdf = async (notationData, options = {}) => {
  return api.post('/export-pdf', {
    notation: notationData,
    title: options.title || '古琴谱',
    composer: options.composer || ''
  });
};

export const getComparisonData = async (pieceId, versions = []) => {
  return api.post('/compare', {
    piece_id: pieceId,
    versions: versions
  });
};

export const getLearningMaterial = async (pieceId, sectionId) => {
  return api.get(`/learning/${pieceId}/${sectionId || ''}`);
};

export const vectorSearch = async (query, options = {}) => {
  return api.post('/vector-search', {
    query: query,
    top_k: options.topK || 10,
    filters: options.filters || {}
  });
};

export const getFingerTechniques = async () => {
  return api.get('/techniques');
};

export const saveNotation = async (data) => {
  return api.post('/save', data);
};

export const loadNotation = async (id) => {
  return api.get(`/load/${id}`);
};

export const getPieces = async () => {
  return api.get('/pieces');
};

export default api;
