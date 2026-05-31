import axios from 'axios';
import type {
  Device, ControlCommand, AnomalyEvent, VirtualLimit,
  CalibrationReport, User, OperationLog, MutexLock, DeviceTelemetry
} from '../types';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user_id: string; username: string; role: string }>('/auth/login', { username, password }),

  register: (username: string, password: string, role?: string) =>
    api.post('/auth/register', { username, password, role }),

  me: () => api.get<User>('/auth/me'),

  logout: () => api.post('/auth/logout')
};

export const deviceApi = {
  list: () => api.get<Device[]>('/devices'),

  get: (id: string) => api.get<Device>(`/devices/${id}`),

  create: (data: Partial<Device>) => api.post('/devices', data),

  update: (id: string, data: Partial<Device>) => api.put(`/devices/${id}`, data),

  delete: (id: string) => api.delete(`/devices/${id}`)
};

export const commandApi = {
  send: (deviceId: string, type: string, params?: Record<string, any>) =>
    api.post<{ id: string; status: string }>('/commands', { device_id: deviceId, type, params }),

  get: (id: string) => api.get<ControlCommand>(`/commands/${id}`),

  listLocks: () => api.get<MutexLock[]>('/commands/locks'),

  acquireLock: (deviceId: string, reason?: string, ttl?: number) =>
    api.post(`/commands/locks/${deviceId}/acquire`, { reason, ttl }),

  releaseLock: (deviceId: string) =>
    api.post(`/commands/locks/${deviceId}/release`)
};

export const anomalyApi = {
  list: (severity?: string) =>
    api.get<AnomalyEvent[]>('/anomalies', { params: { severity } }),

  get: (id: string) => api.get<AnomalyEvent>(`/anomalies/${id}`),

  acknowledge: (id: string) => api.put(`/anomalies/${id}/acknowledge`),

  listByDevice: (deviceId: string, hours?: number) =>
    api.get<AnomalyEvent[]>(`/anomalies/device/${deviceId}`, { params: { hours } })
};

export const limitApi = {
  list: () => api.get<VirtualLimit[]>('/virtual-limits'),

  get: (id: string) => api.get<VirtualLimit>(`/virtual-limits/${id}`),

  create: (data: Partial<VirtualLimit>) => api.post('/virtual-limits', data),

  update: (id: string, data: Partial<VirtualLimit>) => api.put(`/virtual-limits/${id}`, data),

  delete: (id: string) => api.delete(`/virtual-limits/${id}`),

  getByDevice: (deviceId: string) => api.get<VirtualLimit[]>(`/virtual-limits/device/${deviceId}`)
};

export const calibrationApi = {
  calibrate: (deviceId: string, measured: any[], design: any[]) =>
    api.post<CalibrationReport>('/calibrations', { device_id: deviceId, measured, design }),

  getByDevice: (deviceId: string) => api.get(`/calibrations/device/${deviceId}`),

  get: (id: string) => api.get(`/calibrations/${id}`)
};

export const logApi = {
  list: (params?: { limit?: number; action?: string; resource?: string; hours?: number }) =>
    api.get<OperationLog[]>('/logs', { params }),

  get: (id: string) => api.get<OperationLog>(`/logs/${id}`)
};

export const telemetryApi = {
  query: (deviceId: string, start: string, end: string) =>
    api.get<DeviceTelemetry[]>(`/telemetry/${deviceId}`, { params: { start, end } }),

  recent: (deviceId: string, limit?: number) =>
    api.get<DeviceTelemetry[]>(`/telemetry/${deviceId}/recent`, { params: { limit } })
};

export default api;
