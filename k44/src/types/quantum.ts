export interface Complex {
  re: number;
  im: number;
}

export interface QuantumState {
  theta: number;
  phi: number;
  alpha: Complex;
  beta: Complex;
  probability0: number;
  probability1: number;
}

export type PauliGate = 'X' | 'Y' | 'Z';

export type GateMatrix = [
  [Complex | number, Complex | number],
  [Complex | number, Complex | number]
];

export type BellStateType = 'PhiPlus' | 'PhiMinus' | 'PsiPlus' | 'PsiMinus';

export interface TwoQubitState {
  amplitudes: [Complex, Complex, Complex, Complex];
  densityMatrix: Complex[][];
  reducedRhoA: Complex[][];
  reducedRhoB: Complex[][];
  blochVectorA: { x: number; y: number; z: number };
  blochVectorB: { x: number; y: number; z: number };
  bellType: BellStateType;
  concurrence: number;
}

export interface BlochVector {
  x: number;
  y: number;
  z: number;
}
