import { create } from 'zustand';
import { ANNOTATION_COLORS } from '../config';

const useRoomStore = create((set, get) => ({
  user: null,
  token: null,
  role: null,
  roomId: null,
  room: null,
  experts: [],
  device: null,
  isConnected: false,
  isRecording: false,
  isFrozen: false,
  annotations: [],
  measurements: [],
  selectedTool: null,
  selectedAnnotation: null,
  selectedColor: ANNOTATION_COLORS[0],
  myAnnotations: new Set(),
  remoteStreams: new Map(),
  localStream: null,
  networkQuality: 'unknown',
  currentBitrate: 2500000,
  reconnectionState: null,
  pendingAnnotations: [],

  setUser: (user, token, role) => set({ user, token, role }),

  setRoom: (room) => set({ room, roomId: room?.id }),

  setRoomId: (roomId) => set({ roomId }),

  setDevice: (device) => set({ device }),

  setExperts: (experts) => set({ experts }),

  setConnected: (isConnected) => set({ isConnected }),

  setRecording: (isRecording) => set({ isRecording }),

  setFrozen: (isFrozen) => set({ isFrozen }),

  addAnnotation: (annotation) => set((state) => ({
    annotations: [...state.annotations, annotation],
  })),

  updateAnnotation: (annotationId, updates) => set((state) => ({
    annotations: state.annotations.map((a) =>
      a.id === annotationId ? { ...a, ...updates } : a
    ),
  })),

  removeAnnotation: (annotationId) => set((state) => ({
    annotations: state.annotations.filter((a) => a.id !== annotationId),
  })),

  setAnnotations: (annotations) => set({ annotations }),

  addMeasurement: (measurement) => set((state) => ({
    measurements: [...state.measurements, measurement],
  })),

  removeMeasurement: (measurementId) => set((state) => ({
    measurements: state.measurements.filter((m) => m.id !== measurementId),
  })),

  setMeasurements: (measurements) => set({ measurements }),

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  setSelectedAnnotation: (annotation) => set({ selectedAnnotation: annotation }),

  setSelectedColor: (color) => set({ selectedColor: color }),

  setMyAnnotations: (ids) => set({ myAnnotations: new Set(ids) }),

  addMyAnnotation: (id) => set((state) => {
    const set = new Set(state.myAnnotations);
    set.add(id);
    return { myAnnotations: set };
  }),

  setRemoteStream: (expertId, stream) => set((state) => {
    const map = new Map(state.remoteStreams);
    map.set(expertId, stream);
    return { remoteStreams: map };
  }),

  setLocalStream: (stream) => set({ localStream: stream }),

  setNetworkQuality: (quality) => set({ networkQuality: quality }),

  setCurrentBitrate: (bitrate) => set({ currentBitrate: bitrate }),

  setReconnectionState: (state) => set({ reconnectionState: state }),

  addPendingAnnotation: (annotation) => set((state) => ({
    pendingAnnotations: [...state.pendingAnnotations, annotation],
  })),

  clearPendingAnnotations: () => set({ pendingAnnotations: [] }),

  resetRoom: () => set({
    room: null,
    roomId: null,
    experts: [],
    device: null,
    isRecording: false,
    isFrozen: false,
    annotations: [],
    measurements: [],
    selectedTool: null,
    selectedAnnotation: null,
    myAnnotations: new Set(),
    remoteStreams: new Map(),
    pendingAnnotations: [],
  }),

  logout: () => set({
    user: null,
    token: null,
    role: null,
    room: null,
    roomId: null,
    experts: [],
    device: null,
    isConnected: false,
    isRecording: false,
    isFrozen: false,
    annotations: [],
    measurements: [],
    selectedTool: null,
    selectedAnnotation: null,
    myAnnotations: new Set(),
    remoteStreams: new Map(),
    localStream: null,
    networkQuality: 'unknown',
    currentBitrate: 2500000,
    reconnectionState: null,
    pendingAnnotations: [],
  }),
}));

export default useRoomStore;
