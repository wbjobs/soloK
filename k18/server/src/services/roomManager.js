const { v4: uuidv4 } = require('uuid');
const { redis } = require('../config/redis');
const config = require('../config');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.maxExperts = config.maxExperts;
  }

  createRoom(creatorId, creatorName) {
    const roomId = uuidv4();
    const room = {
      id: roomId,
      creatorId,
      creatorName,
      deviceId: null,
      deviceName: '',
      experts: new Map(),
      isActive: false,
      isRecording: false,
      createdAt: Date.now(),
      startedAt: null,
      frozen: false,
      annotations: [],
      measurements: [],
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  joinRoom(roomId, expertId, expertName) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.experts.size >= this.maxExperts) {
      return { error: 'Maximum number of experts reached' };
    }
    room.experts.set(expertId, {
      id: expertId,
      name: expertName,
      joinedAt: Date.now(),
    });
    return room;
  }

  leaveRoom(roomId, expertId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.experts.delete(expertId);
    return room;
  }

  registerDevice(roomId, deviceId, deviceName) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.deviceId = deviceId;
    room.deviceName = deviceName;
    room.isActive = true;
    room.startedAt = Date.now();
    return room;
  }

  unregisterDevice(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.deviceId = null;
    room.deviceName = '';
    room.isActive = false;
    return room;
  }

  setFrozen(roomId, frozen) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.frozen = frozen;
    return room;
  }

  setRecording(roomId, isRecording) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.isRecording = isRecording;
    return room;
  }

  addAnnotation(roomId, annotation) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.annotations.push(annotation);
    return annotation;
  }

  updateAnnotation(roomId, annotationId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const idx = room.annotations.findIndex((a) => a.id === annotationId);
    if (idx === -1) return null;
    room.annotations[idx] = { ...room.annotations[idx], ...updates };
    return room.annotations[idx];
  }

  removeAnnotation(roomId, annotationId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.annotations = room.annotations.filter((a) => a.id !== annotationId);
    return true;
  }

  addMeasurement(roomId, measurement) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.measurements.push(measurement);
    return measurement;
  }

  removeMeasurement(roomId, measurementId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.measurements = room.measurements.filter((m) => m.id !== measurementId);
    return true;
  }

  getRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      id: room.id,
      deviceId: room.deviceId,
      deviceName: room.deviceName,
      isActive: room.isActive,
      isRecording: room.isRecording,
      frozen: room.frozen,
      expertCount: room.experts.size,
      maxExperts: this.maxExperts,
      experts: Array.from(room.experts.values()),
      annotations: room.annotations,
      measurements: room.measurements,
    };
  }

  getAllActiveRooms() {
    return Array.from(this.rooms.values())
      .filter((r) => r.isActive)
      .map((r) => this.getRoomState(r.id));
  }
}

const roomManager = new RoomManager();
module.exports = roomManager;
