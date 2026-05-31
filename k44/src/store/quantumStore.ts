import { create } from 'zustand';
import { QuantumState, PauliGate } from '@/types/quantum';
import {
  anglesToState,
  applyGate,
  PAULI_GATES,
  measure,
  collapseToState
} from '@/utils/quantumMath';

interface QuantumStore {
  state: QuantumState;
  measurementResult: '0' | '1' | null;
  isAnimating: boolean;

  setAngles: (theta: number, phi: number) => void;
  applyPauliGate: (gate: PauliGate) => void;
  performMeasurement: () => void;
  resetState: () => void;
  clearMeasurement: () => void;
  setAnimating: (value: boolean) => void;
}

const initialState = anglesToState(0, 0);

export const useQuantumStore = create<QuantumStore>((set) => ({
  state: initialState,
  measurementResult: null,
  isAnimating: false,

  setAngles: (theta, phi) => {
    const newState = anglesToState(theta, phi);
    set({ state: newState, measurementResult: null });
  },

  applyPauliGate: (gate) => {
    set((prev) => {
      const gateMatrix = PAULI_GATES[gate];
      const newState = applyGate(prev.state, gateMatrix);
      return { state: newState, measurementResult: null, isAnimating: true };
    });
  },

  performMeasurement: () => {
    set((prev) => {
      const result = measure(prev.state);
      const collapsedState = collapseToState(result);
      return { state: collapsedState, measurementResult: result, isAnimating: true };
    });
  },

  resetState: () => {
    set({ state: initialState, measurementResult: null });
  },

  clearMeasurement: () => {
    set({ measurementResult: null });
  },

  setAnimating: (value) => {
    set({ isAnimating: value });
  }
}));
