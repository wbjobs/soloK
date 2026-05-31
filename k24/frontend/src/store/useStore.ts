import { create } from 'zustand';

export interface HypercubeInfo {
  fileId: string;
  filename: string;
  width: number;
  height: number;
  bands: number;
  wavelengths: number[];
  uploadedAt: Date;
}

interface AppState {
  currentHypercube: HypercubeInfo | null;
  hypercubes: HypercubeInfo[];
  selectedCoordinates: { x: number; y: number } | null;
  selectedPixelSpectrum: number[] | null;
  
  setCurrentHypercube: (cube: HypercubeInfo | null) => void;
  addHypercube: (cube: HypercubeInfo) => void;
  removeHypercube: (fileId: string) => void;
  setSelectedCoordinates: (coords: { x: number; y: number } | null) => void;
  setSelectedPixelSpectrum: (spectrum: number[] | null) => void;
}

export const useStore = create<AppState>((set) => ({
  currentHypercube: null,
  hypercubes: [],
  selectedCoordinates: null,
  selectedPixelSpectrum: null,
  
  setCurrentHypercube: (cube) => set({ currentHypercube: cube }),
  addHypercube: (cube) =>
    set((state) => ({
      hypercubes: [...state.hypercubes, cube],
      currentHypercube: cube,
    })),
  removeHypercube: (fileId) =>
    set((state) => ({
      hypercubes: state.hypercubes.filter((c) => c.fileId !== fileId),
      currentHypercube:
        state.currentHypercube?.fileId === fileId
          ? null
          : state.currentHypercube,
    })),
  setSelectedCoordinates: (coords) => set({ selectedCoordinates: coords }),
  setSelectedPixelSpectrum: (spectrum) => set({ selectedPixelSpectrum: spectrum }),
}));
