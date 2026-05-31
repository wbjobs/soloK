import axios from 'axios'

const API_BASE_URL = '/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.message)
    return Promise.reject(error)
  }
)

export const uploadAPI = {
  uploadFile: (file, name, description) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    if (description) formData.append('description', description)

    return apiClient.post('/upload/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  parseMission: (missionId) =>
    apiClient.post(`/upload/parse/${missionId}`),

  enhanceImage: (missionId, options = {}) =>
    apiClient.post(`/upload/enhance/${missionId}`, options),
}

export const detectAPI = {
  detectMission: (missionId, frameData = null) =>
    apiClient.post('/detect', { mission_id: missionId, frame_data: frameData }),

  detectFrame: (missionId, frameIndex = 0, confThreshold = 0.3) =>
    apiClient.post(`/detect/frame/${missionId}`, null, {
      params: { frame_index: frameIndex, conf_threshold: confThreshold },
    }),

  trackObjects: (missionId, options = {}) =>
    apiClient.post(`/detect/track/${missionId}`, options),

  measureDetections: (missionId) =>
    apiClient.post(`/detect/measure/${missionId}`),
}

export const missionAPI = {
  list: (params = {}) =>
    apiClient.get('/missions', { params }),

  get: (missionId) =>
    apiClient.get(`/missions/${missionId}`),

  create: (missionData) =>
    apiClient.post('/missions', missionData),

  update: (missionId, data) =>
    apiClient.put(`/missions/${missionId}`, data),

  delete: (missionId) =>
    apiClient.delete(`/missions/${missionId}`),

  getDetections: (missionId, params = {}) =>
    apiClient.get(`/missions/${missionId}/detections`, { params }),

  getTracks: (missionId) =>
    apiClient.get(`/missions/${missionId}/tracks`),

  getMeasurements: (missionId) =>
    apiClient.get(`/missions/${missionId}/measurements`),

  getStatistics: (missionId) =>
    apiClient.get(`/missions/${missionId}/statistics`),
}

export const reportAPI = {
  downloadPDF: (missionId) =>
    apiClient.get(`/report/missions/${missionId}/pdf`, {
      responseType: 'blob',
    }),

  getTerrainMap: (missionId, format = 'png') =>
    apiClient.get(`/report/missions/${missionId}/terrain`, {
      params: { format },
      responseType: 'blob',
    }),

  getPieChart: (missionId) =>
    apiClient.get(`/report/missions/${missionId}/pie-chart`),
}

export const healthAPI = {
  check: () => apiClient.get('/health'),
  info: () => apiClient.get('/info'),
}

export default apiClient
