import { useCallback } from 'react';
import useRoomStore from '../store/roomStore';
import socketService from '../services/socket';

export function useRoom() {
  const store = useRoomStore();

  const joinRoom = useCallback((roomId, expertName) => {
    const socketId = socketService.id || Date.now().toString();
    socketService.send('expert:join', {
      roomId,
      expertName,
      expertId: socketId,
    });
    store.setRoomId(roomId);
  }, [store]);

  const createRoom = useCallback((expertName) => {
    const roomId = 'room-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    store.setRoomId(roomId);
    socketService.send('expert:join', {
      roomId,
      expertName,
      expertId: socketService.id || 'expert-' + Date.now(),
    });
    return roomId;
  }, [store]);

  const registerDevice = useCallback((roomId, deviceName) => {
    socketService.send('device:register', { roomId, deviceName });
    store.setRoomId(roomId);
  }, [store]);

  const leaveRoom = useCallback(() => {
    socketService.send('expert:leave', {});
    store.resetRoom();
  }, [store]);

  const freezeStream = useCallback(() => {
    socketService.send('stream:freeze', { roomId: store.roomId });
    store.setFrozen(true);
  }, [store]);

  const unfreezeStream = useCallback(() => {
    socketService.send('stream:unfreeze', { roomId: store.roomId });
    store.setFrozen(false);
  }, [store]);

  const addAnnotation = useCallback((annotation) => {
    const ann = {
      ...annotation,
      timestamp: Date.now(),
    };
    store.addAnnotation(ann);
    store.addMyAnnotation(ann.id);
    socketService.send('annotation:add', {
      roomId: store.roomId,
      annotation: ann,
    });
    return ann;
  }, [store]);

  const updateAnnotation = useCallback((annotationId, updates) => {
    store.updateAnnotation(annotationId, updates);
    socketService.send('annotation:update', {
      roomId: store.roomId,
      annotationId,
      updates,
    });
  }, [store]);

  const removeAnnotation = useCallback((annotationId) => {
    store.removeAnnotation(annotationId);
    socketService.send('annotation:remove', {
      roomId: store.roomId,
      annotationId,
    });
  }, [store]);

  const addMeasurement = useCallback((measurement) => {
    const m = {
      ...measurement,
      timestamp: Date.now(),
    };
    store.addMeasurement(m);
    socketService.send('measurement:add', {
      roomId: store.roomId,
      measurement: m,
    });
    return m;
  }, [store]);

  const removeMeasurement = useCallback((measurementId) => {
    store.removeMeasurement(measurementId);
    socketService.send('measurement:remove', {
      roomId: store.roomId,
      measurementId,
    });
  }, [store]);

  const startRecording = useCallback(() => {
    socketService.send('recording:start', { roomId: store.roomId });
    store.setRecording(true);
  }, [store]);

  const stopRecording = useCallback(() => {
    socketService.send('recording:stop', { roomId: store.roomId });
    store.setRecording(false);
  }, [store]);

  const saveKeyframe = useCallback((frameData, diagnosis, report) => {
    socketService.send('keyframe:save', {
      roomId: store.roomId,
      frameData,
      diagnosis,
      report,
    });
  }, [store]);

  const requestRoomState = useCallback(() => {
    socketService.send('room:state', { roomId: store.roomId });
  }, [store]);

  return {
    joinRoom,
    createRoom,
    registerDevice,
    leaveRoom,
    freezeStream,
    unfreezeStream,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    addMeasurement,
    removeMeasurement,
    startRecording,
    stopRecording,
    saveKeyframe,
    requestRoomState,
    ...store,
  };
}
