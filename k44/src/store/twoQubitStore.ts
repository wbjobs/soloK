import { create } from 'zustand';
import { BellStateType, TwoQubitState } from '@/types/quantum';
import { createBellState } from '@/utils/twoQubitMath';

interface TwoQubitStore {
  state: TwoQubitState;
  bellType: BellStateType;

  setBellType: (type: BellStateType) => void;
}

export const useTwoQubitStore = create<TwoQubitStore>((set) => ({
  state: createBellState('PhiPlus'),
  bellType: 'PhiPlus',

  setBellType: (type) => {
    const newState = createBellState(type);
    set({ state: newState, bellType: type });
  }
}));
