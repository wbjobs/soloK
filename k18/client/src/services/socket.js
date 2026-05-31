import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    return new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connected:', this.socket.id);
        resolve(this.socket);
      });

      this.socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err);
        reject(err);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        this.emit('disconnected', { reason });
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
        this.emit('reconnected', { attemptNumber });
      });

      this.socket.on('reconnecting', (attemptNumber) => {
        console.log('[Socket] Reconnecting attempt:', attemptNumber);
        this.emit('reconnecting', { attemptNumber });
      });

      this.setupEventHandlers();
    });
  }

  setupEventHandlers() {
    const events = [
      'room:created',
      'room:updated',
      'room:state',
      'device:connected',
      'device:disconnected',
      'device:ready',
      'expert:joined',
      'expert:left',
      'webrtc:offer',
      'webrtc:answer',
      'webrtc:ice-candidate',
      'stream:frozen',
      'stream:unfrozen',
      'annotation:added',
      'annotation:updated',
      'annotation:removed',
      'measurement:added',
      'measurement:removed',
      'keyframe:saved',
      'recording:started',
      'recording:stopped',
      'bitrate:adjusted',
      'error',
      'pong',
    ];

    events.forEach((event) => {
      this.socket.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data));
    }
  }

  send(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  get isConnected() {
    return this.socket?.connected || false;
  }

  get id() {
    return this.socket?.id;
  }
}

const socketService = new SocketService();
export default socketService;
