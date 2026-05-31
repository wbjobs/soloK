import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

export const uploadAudio = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await axios.post(`${API_BASE}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const analyzeAudio = async (fileId) => {
  const response = await axios.post(`${API_BASE}/detection/analyze`, null, {
    params: { file_id: fileId },
  });
  return response.data;
};

export const generateReport = async (fileId, resultJson) => {
  const response = await axios.post(`${API_BASE}/report/generate`, null, {
    params: {
      file_id: fileId,
      result_json: JSON.stringify(resultJson),
    },
  });
  return response.data;
};

export const downloadReport = async (fileId) => {
  window.open(`${API_BASE}/report/download/${fileId}`, '_blank');
};

export const registerSpeaker = async (speakerId, file) => {
  const formData = new FormData();
  formData.append('speaker_id', speakerId);
  formData.append('file', file);
  
  const response = await axios.post(`${API_BASE}/speaker/register`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const verifySpeaker = async (fileId, speakerId = null) => {
  const params = { file_id: fileId };
  if (speakerId) params.speaker_id = speakerId;
  
  const response = await axios.post(`${API_BASE}/speaker/verify`, null, { params });
  return response.data;
};

export const getRegisteredSpeakers = async () => {
  const response = await axios.get(`${API_BASE}/speaker/speakers`);
  return response.data;
};

export const realtimeDetection = async (audioBase64) => {
  const response = await axios.post(`${API_BASE}/detection/realtime`, {
    audio_base64: audioBase64,
  });
  return response.data;
};
