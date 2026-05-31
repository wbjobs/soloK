import { Complex, QuantumState, GateMatrix } from '@/types/quantum';

export const complexAdd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im
});

export const complexMult = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re
});

export const complexScalarMult = (c: Complex, s: number): Complex => ({
  re: c.re * s,
  im: c.im * s
});

export const complexAbsSq = (c: Complex): number => c.re * c.re + c.im * c.im;

export const complexToComplex = (x: Complex | number): Complex =>
  typeof x === 'number' ? { re: x, im: 0 } : x;

export const anglesToState = (theta: number, phi: number): QuantumState => {
  const cosHalfTheta = Math.cos(theta / 2);
  const sinHalfTheta = Math.sin(theta / 2);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const alpha: Complex = { re: cosHalfTheta, im: 0 };
  const beta: Complex = {
    re: sinHalfTheta * cosPhi, im: sinHalfTheta * sinPhi
  };

  const probability0 = complexAbsSq(alpha);
  const probability1 = complexAbsSq(beta);

  return { theta, phi, alpha, beta, probability0, probability1 };
};

export const stateToAngles = (alpha: Complex, beta: Complex): { theta: number; phi: number } => {
  const alphaAbs = Math.sqrt(complexAbsSq(alpha));
  const betaAbs = Math.sqrt(complexAbsSq(beta));

  let theta = 2 * Math.acos(Math.min(1, Math.max(0, alphaAbs)));

  let phi = 0;
  if (betaAbs > 1e-10) {
    phi = Math.atan2(beta.im, beta.re);
  }

  return { theta, phi };
};

export const applyGate = (state: QuantumState, gate: GateMatrix): QuantumState => {
  const alpha = state.alpha;
  const beta = state.beta;

  const gate00 = complexToComplex(gate[0][0]);
  const gate01 = complexToComplex(gate[0][1]);
  const gate10 = complexToComplex(gate[1][0]);
  const gate11 = complexToComplex(gate[1][1]);

  const newAlpha = complexAdd(
    complexMult(gate00, alpha),
    complexMult(gate01, beta)
  );
  const newBeta = complexAdd(
    complexMult(gate10, alpha),
    complexMult(gate11, beta)
  );

  const norm = Math.sqrt(complexAbsSq(newAlpha) + complexAbsSq(newBeta));

  const normalizedAlpha = complexScalarMult(newAlpha, 1 / norm);
  const normalizedBeta = complexScalarMult(newBeta, 1 / norm);

  const { theta, phi } = stateToAngles(normalizedAlpha, normalizedBeta);

  return {
    theta,
    phi,
    alpha: normalizedAlpha,
    beta: normalizedBeta,
    probability0: complexAbsSq(normalizedAlpha),
    probability1: complexAbsSq(normalizedBeta)
  };
};

export const X_GATE: GateMatrix = [
  [0, 1],
  [1, 0]
];

export const Y_GATE: GateMatrix = [
  [0, { re: 0, im: -1 }],
  [{ re: 0, im: 1 }, 0]
];

export const Z_GATE: GateMatrix = [
  [1, 0],
  [0, -1]
];

export const PAULI_GATES: Record<string, GateMatrix> = {
  X: X_GATE,
  Y: Y_GATE,
  Z: Z_GATE
};

export const measure = (state: QuantumState): '0' | '1' => {
  const random = Math.random();
  return random < state.probability0 ? '0' : '1';
};

export const collapseToState = (result: '0' | '1'): QuantumState => {
  if (result === '0') {
    return anglesToState(0, 0);
  } else {
    return anglesToState(Math.PI, 0);
  }
};

export const stateToCartesian = (theta: number, phi: number): { x: number; y: number; z: number } => {
  return {
    x: Math.sin(theta) * Math.cos(phi),
    y: Math.sin(theta) * Math.sin(phi),
    z: Math.cos(theta)
  };
};

export const formatComplex = (c: Complex): string => {
  const re = c.re.toFixed(3);
  const im = Math.abs(c.im).toFixed(3);
  if (Math.abs(c.im) < 1e-10) {
    return re;
  }
  if (Math.abs(c.re) < 1e-10) {
    return `${c.im >= 0 ? '' : '-'}${im}i`;
  }
  return `${re} ${c.im >= 0 ? '+' : '-'} ${im}i`;
};
