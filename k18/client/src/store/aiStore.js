import { create } from 'zustand';

const useAIStore = create((set, get) => ({
  isEnabled: false,
  isLoading: false,
  isReady: false,
  mockMode: false,
  detections: [],
  acceptedDetections: [],
  rejectedIds: new Set(),
  pendingDetections: [],
  confidenceThreshold: 0.6,
  autoAccept: false,
  lastDetectionTime: null,

  setEnabled: (isEnabled) => set({ isEnabled }),
  setLoading: (isLoading) => set({ isLoading }),
  setReady: (isReady, mockMode) => set({ isReady, mockMode }),
  setDetections: (detections) => {
    const { rejectedIds, autoAccept, addAcceptedDetection } = get();
    const filtered = detections.filter((d) => !rejectedIds.has(d.id));

    if (autoAccept) {
      filtered.forEach((d) => addAcceptedDetection(d));
      set({ detections: filtered, acceptedDetections: [...get().acceptedDetections, ...filtered] });
    } else {
      set({ detections: filtered, pendingDetections: filtered });
    }
  },
  acceptDetection: (detection) => {
    const { acceptedDetections } = get();
    set({
      acceptedDetections: [...acceptedDetections, detection],
      detections: get().detections.filter((d) => d.id !== detection.id),
      pendingDetections: get().pendingDetections.filter((d) => d.id !== detection.id),
    });
  },
  rejectDetection: (detectionId) => {
    const { rejectedIds } = get();
    const newRejected = new Set(rejectedIds);
    newRejected.add(detectionId);
    set({
      rejectedIds: newRejected,
      detections: get().detections.filter((d) => d.id !== detectionId),
      pendingDetections: get().pendingDetections.filter((d) => d.id !== detectionId),
    });
  },
  addAcceptedDetection: (detection) => {
    const { acceptedDetections } = get();
    set({ acceptedDetections: [...acceptedDetections, detection] });
  },
  clearDetections: () => set({
    detections: [],
    acceptedDetections: [],
    pendingDetections: [],
    rejectedIds: new Set(),
  }),
  clearPending: () => set({
    detections: [],
    pendingDetections: [],
  }),
  setConfidenceThreshold: (threshold) => set({ confidenceThreshold: threshold }),
  setAutoAccept: (autoAccept) => set({ autoAccept }),
  setLastDetectionTime: (time) => set({ lastDetectionTime: time }),
}));

export default useAIStore;
