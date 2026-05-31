const { v4: uuidv4 } = require('uuid');
const roomManager = require('./roomManager');
const recordingService = require('./recording');
const config = require('../config');

class SignalingService {
  constructor(io) {
    this.io = io;
    this.peerConnections = new Map();
  }

  setupHandlers(socket) {
    socket.on('device:register', this.handleDeviceRegister.bind(this, socket));
    socket.on('expert:join', this.handleExpertJoin.bind(this, socket));
    socket.on('expert:leave', this.handleExpertLeave.bind(this, socket));

    socket.on('webrtc:offer', this.handleOffer.bind(this, socket));
    socket.on('webrtc:answer', this.handleAnswer.bind(this, socket));
    socket.on('webrtc:ice-candidate', this.handleIceCandidate.bind(this, socket));

    socket.on('stream:freeze', this.handleFreeze.bind(this, socket));
    socket.on('stream:unfreeze', this.handleUnfreeze.bind(this, socket));

    socket.on('annotation:add', this.handleAnnotationAdd.bind(this, socket));
    socket.on('annotation:update', this.handleAnnotationUpdate.bind(this, socket));
    socket.on('annotation:remove', this.handleAnnotationRemove.bind(this, socket));

    socket.on('measurement:add', this.handleMeasurementAdd.bind(this, socket));
    socket.on('measurement:remove', this.handleMeasurementRemove.bind(this, socket));

    socket.on('keyframe:save', this.handleKeyframeSave.bind(this, socket));
    socket.on('recording:start', this.handleRecordingStart.bind(this, socket));
    socket.on('recording:stop', this.handleRecordingStop.bind(this, socket));

    socket.on('bitrate:adjust', this.handleBitrateAdjust.bind(this, socket));
    socket.on('network:stats', this.handleNetworkStats.bind(this, socket));

    socket.on('room:state', this.handleRoomState.bind(this, socket));
    socket.on('disconnect', this.handleDisconnect.bind(this, socket));

    socket.on('ping', () => {
      socket.emit('pong', Date.now());
    });
  }

  handleDeviceRegister(socket, { roomId, deviceName }) {
    const room = roomManager.registerDevice(roomId, socket.id, deviceName);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    socket.join(roomId);
    socket.data = { roomId, role: 'device', deviceName };
    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
    this.io.to(roomId).emit('device:connected', { deviceId: socket.id, deviceName });
    console.log(`[Device] ${deviceName} registered in room ${roomId}`);
  }

  handleExpertJoin(socket, { roomId, expertName, expertId }) {
    const result = roomManager.joinRoom(roomId, socket.id, expertName);
    if (result && result.error) {
      socket.emit('error', { message: result.error });
      return;
    }
    if (!result) {
      const room = roomManager.createRoom(socket.id, expertName);
      roomManager.joinRoom(room.id, socket.id, expertName);
      socket.join(room.id);
      socket.data = { roomId: room.id, role: 'expert', expertName, expertId: socket.id };
      socket.emit('room:created', { roomId: room.id });
    } else {
      socket.join(roomId);
      socket.data = { roomId, role: 'expert', expertName, expertId: socket.id };
    }

    const state = roomManager.getRoomState(socket.data.roomId);
    socket.emit('room:state', state);
    this.io.to(socket.data.roomId).emit('expert:joined', {
      id: socket.id,
      name: expertName,
    });
    this.io.to(socket.data.roomId).emit('room:updated', roomManager.getRoomState(socket.data.roomId));

    if (state.deviceId) {
      socket.emit('device:ready', { deviceId: state.deviceId });
    }

    console.log(`[Expert] ${expertName} joined room ${socket.data.roomId}`);
  }

  handleExpertLeave(socket) {
    const { roomId, role, expertName } = socket.data;
    if (!roomId) return;
    if (role === 'expert') {
      roomManager.leaveRoom(roomId, socket.id);
      this.io.to(roomId).emit('expert:left', { id: socket.id });
      this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
      console.log(`[Expert] ${expertName} left room ${roomId}`);
    }
  }

  handleOffer(socket, { to, offer, roomId }) {
    const target = this.io.sockets.sockets.get(to);
    if (target) {
      target.emit('webrtc:offer', { from: socket.id, offer });
    }
  }

  handleAnswer(socket, { to, answer, roomId }) {
    const target = this.io.sockets.sockets.get(to);
    if (target) {
      target.emit('webrtc:answer', { from: socket.id, answer });
    }
  }

  handleIceCandidate(socket, { to, candidate, roomId }) {
    const target = this.io.sockets.sockets.get(to);
    if (target) {
      target.emit('webrtc:ice-candidate', { from: socket.id, candidate });
    }
  }

  handleFreeze(socket, { roomId }) {
    const room = roomManager.setFrozen(roomId, true);
    if (room) {
      this.io.to(roomId).emit('stream:frozen', { by: socket.id, byName: socket.data.expertName || socket.data.deviceName });
      this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
    }
  }

  handleUnfreeze(socket, { roomId }) {
    const room = roomManager.setFrozen(roomId, false);
    if (room) {
      this.io.to(roomId).emit('stream:unfrozen', { by: socket.id });
      this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
    }
  }

  handleAnnotationAdd(socket, { roomId, annotation }) {
    const ann = {
      ...annotation,
      id: uuidv4(),
      expertId: socket.id,
      expertName: socket.data.expertName || 'Unknown',
      timestamp: Date.now(),
    };
    roomManager.addAnnotation(roomId, ann);
    recordingService.addAnnotation(roomId, ann);
    socket.to(roomId).emit('annotation:added', ann);
    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
  }

  handleAnnotationUpdate(socket, { roomId, annotationId, updates }) {
    const ann = roomManager.updateAnnotation(roomId, annotationId, {
      ...updates,
      expertId: socket.id,
      expertName: socket.data.expertName || 'Unknown',
      timestamp: Date.now(),
    });
    if (ann) {
      recordingService.addAnnotationUpdate(roomId, annotationId, ann);
      socket.to(roomId).emit('annotation:updated', ann);
    }
  }

  handleAnnotationRemove(socket, { roomId, annotationId }) {
    roomManager.removeAnnotation(roomId, annotationId);
    recordingService.addAnnotationRemove(roomId, annotationId);
    socket.to(roomId).emit('annotation:removed', { annotationId, expertId: socket.id });
    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
  }

  handleMeasurementAdd(socket, { roomId, measurement }) {
    const m = {
      ...measurement,
      id: uuidv4(),
      expertId: socket.id,
      expertName: socket.data.expertName || 'Unknown',
      timestamp: Date.now(),
    };
    roomManager.addMeasurement(roomId, m);
    recordingService.addMeasurement(roomId, m);
    socket.to(roomId).emit('measurement:added', m);
    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
  }

  handleMeasurementRemove(socket, { roomId, measurementId }) {
    roomManager.removeMeasurement(roomId, measurementId);
    recordingService.addMeasurementRemove(roomId, measurementId);
    socket.to(roomId).emit('measurement:removed', { measurementId, expertId: socket.id });
    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
  }

  handleKeyframeSave(socket, { roomId, frameData, diagnosis, report }) {
    const keyframe = {
      id: uuidv4(),
      roomId,
      expertId: socket.id,
      expertName: socket.data.expertName,
      diagnosis: diagnosis || '',
      report: report || {},
      timestamp: Date.now(),
    };
    recordingService.addKeyframe(roomId, keyframe);
    this.io.to(roomId).emit('keyframe:saved', keyframe);
    console.log(`[Keyframe] Saved by ${socket.data.expertName} in room ${roomId}`);
  }

  async handleRecordingStart(socket, { roomId }) {
    roomManager.setRecording(roomId, true);
    await recordingService.startRecording(roomId, {
      startedBy: socket.id,
      startedByName: socket.data.expertName,
    });
    this.io.to(roomId).emit('recording:started', { roomId, startedAt: Date.now() });
    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
    console.log(`[Recording] Started in room ${roomId}`);
  }

  async handleRecordingStop(socket, { roomId }) {
    roomManager.setRecording(roomId, false);
    const recording = await recordingService.stopRecording(roomId);
    this.io.to(roomId).emit('recording:stopped', { 
      roomId, 
      stoppedAt: Date.now(),
      recordingId: recording?.id,
      duration: recording?.duration,
    });
    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));
    console.log(`[Recording] Stopped in room ${roomId}`);
  }

  handleBitrateAdjust(socket, { roomId, bitrate }) {
    const { base, min, max } = config.videoBitrate;
    const adjusted = Math.max(min, Math.min(max, bitrate));
    socket.to(roomId).emit('bitrate:adjusted', { bitrate: adjusted });
  }

  handleNetworkStats(socket, { roomId, stats }) {
    socket.data.networkStats = {
      ...stats,
      timestamp: Date.now(),
    };
  }

  handleRoomState(socket, { roomId }) {
    const state = roomManager.getRoomState(roomId);
    if (state) {
      socket.emit('room:state', state);
    }
  }

  handleDisconnect(socket) {
    const { roomId, role, expertName, deviceName } = socket.data;
    if (!roomId) return;

    if (role === 'expert') {
      roomManager.leaveRoom(roomId, socket.id);
      this.io.to(roomId).emit('expert:left', { id: socket.id });
      console.log(`[Expert] ${expertName} disconnected from room ${roomId}`);
    } else if (role === 'device') {
      roomManager.unregisterDevice(roomId);
      this.io.to(roomId).emit('device:disconnected', { deviceId: socket.id });
      console.log(`[Device] ${deviceName} disconnected from room ${roomId}`);
    }

    this.io.to(roomId).emit('room:updated', roomManager.getRoomState(roomId));

    const room = roomManager.getRoom(roomId);
    if (room && room.experts.size === 0 && !room.deviceId) {
      setTimeout(() => {
        const r = roomManager.getRoom(roomId);
        if (r && r.experts.size === 0 && !r.deviceId) {
          roomManager.deleteRoom(roomId);
          console.log(`[Room] ${roomId} cleaned up`);
        }
      }, 30000);
    }
  }
}

module.exports = SignalingService;
