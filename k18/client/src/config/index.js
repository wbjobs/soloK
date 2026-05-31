export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

export const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const PEER_CONNECTION_CONFIG = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export const ANNOTATION_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
];

export const TOOL_TYPES = {
  SELECT: 'select',
  ARROW: 'arrow',
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  FREEHAND: 'freehand',
  DISTANCE: 'distance',
  AREA: 'area',
  ANGLE: 'angle',
  ERASER: 'eraser',
};

export const NETWORK_QUALITY = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
  UNKNOWN: 'unknown',
};
