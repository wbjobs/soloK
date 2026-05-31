import { create } from 'zustand';

const useVolumeStore = create((set, get) => ({
  is3DMode: false,
  volumeData: null,
  isLoading: false,
  annotations3D: [],
  selectedAnnotation: null,
  slices: { axial: 0, coronal: 0, sagittal: 0 },

  set3DMode: (is3DMode) => set({ is3DMode }),
  setVolumeData: (volumeData) => set({ volumeData }),
  setLoading: (isLoading) => set({ isLoading }),
  setAnnotations3D: (annotations3D) => set({ annotations3D }),
  addAnnotation3D: (annotation) => set({
    annotations3D: [...get().annotations3D, annotation],
  }),
  removeAnnotation3D: (annotationId) => set({
    annotations3D: get().annotations3D.filter((a) => a.id !== annotationId),
  }),
  setSelectedAnnotation: (annotation) => set({ selectedAnnotation: annotation }),
  setSlices: (slices) => set({ slices }),
  clearVolume: () => set({
    volumeData: null,
    annotations3D: [],
    selectedAnnotation: null,
    is3DMode: false,
  }),
}));

export default useVolumeStore;
