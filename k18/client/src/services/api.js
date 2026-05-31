import axios from 'axios';
import { API_BASE_URL } from '../config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username, password, role) =>
    apiClient.post('/auth/login', { username, password, role }).then((r) => r.data),

  verify: () =>
    apiClient.post('/auth/verify').then((r) => r.data),
};

export const roomApi = {
  getAll: () =>
    apiClient.get('/rooms').then((r) => r.data),

  getById: (roomId) =>
    apiClient.get(`/rooms/${roomId}`).then((r) => r.data),

  create: () =>
    apiClient.post('/rooms').then((r) => r.data),

  getState: (roomId) =>
    apiClient.get(`/rooms/${roomId}/state`).then((r) => r.data),

  getExperts: (roomId) =>
    apiClient.get(`/rooms/${roomId}/experts`).then((r) => r.data),

  getNetworkStats: (roomId) =>
    apiClient.get(`/rooms/${roomId}/network-stats`).then((r) => r.data),
};

export const keyframeApi = {
  save: (roomId, frameData, diagnosis, report) =>
    apiClient.post(`/rooms/${roomId}/keyframes`, {
      frameData,
      diagnosis,
      report,
    }).then((r) => r.data),

  getByRoom: (roomId) =>
    apiClient.get(`/rooms/${roomId}/keyframes`).then((r) => r.data),

  getById: (keyframeId) =>
    apiClient.get(`/keyframes/${keyframeId}`).then((r) => r.data),

  updateReport: (keyframeId, diagnosis, report) =>
    apiClient.put(`/keyframes/${keyframeId}/report`, {
      diagnosis,
      report,
    }).then((r) => r.data),
};

export const recordingApi = {
  getByRoom: (roomId) =>
    apiClient.get(`/rooms/${roomId}/recordings`).then((r) => r.data),

  getUrl: (fileName) =>
    apiClient.get(`/recordings/${fileName}/url`).then((r) => r.data),
};

export default apiClient;
