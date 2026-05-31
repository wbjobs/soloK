import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),
};

export const parcelAPI = {
  createParcel: (data) => api.post('/parcels', data),
  getParcels: (params) => api.get('/parcels', { params }),
  getParcel: (trackingNumber) => api.get(`/parcels/${trackingNumber}`),
};

export const trackingAPI = {
  scanNode: (data) => api.post('/tracking/scan', data),
  getTrace: (trackingNumber) => api.get(`/tracking/${trackingNumber}/trace`),
  getPrediction: (trackingNumber) => api.get(`/tracking/${trackingNumber}/prediction`),
};

export default api;
