import { Complex, BellStateType, TwoQubitState, BlochVector } from '@/types/quantum';
import {
  complexAdd,
  complexMult,
  complexAbsSq,
  complexScalarMult
} from './quantumMath';

const ZERO: Complex = { re: 0, im: 0 };
const ONE: Complex = { re: 1, im: 0 };
const MINUS_ONE: Complex = { re: -1, im: 0 };
const INV_SQRT2 = 1 / Math.sqrt(2);

export const BELL_STATES: Record<BellStateType, {
  label: string;
  symbol: string;
  latex: string;
  amplitudes: [Complex, Complex, Complex, Complex];
  correlationA: [number, number];
  correlationB: [number, number];
}> = {
  PhiPlus: {
    label: 'Φ⁺',
    symbol: '|Φ⁺⟩',
    latex: '(|00⟩+|11⟩)/√2',
    amplitudes: [
      { re: INV_SQRT2, im: 0 },
      ZERO,
      ZERO,
      { re: INV_SQRT2, im: 0 }
    ],
    correlationA: [1, -1],
    correlationB: [1, -1]
  },
  PhiMinus: {
    label: 'Φ⁻',
    symbol: '|Φ⁻⟩',
    latex: '(|00⟩-|11⟩)/√2',
    amplitudes: [
      { re: INV_SQRT2, im: 0 },
      ZERO,
      ZERO,
      { re: -INV_SQRT2, im: 0 }
    ],
    correlationA: [1, -1],
    correlationB: [1, -1]
  },
  PsiPlus: {
    label: 'Ψ⁺',
    symbol: '|Ψ⁺⟩',
    latex: '(|01⟩+|10⟩)/√2',
    amplitudes: [
      ZERO,
      { re: INV_SQRT2, im: 0 },
      { re: INV_SQRT2, im: 0 },
      ZERO
    ],
    correlationA: [1, -1],
    correlationB: [-1, 1]
  },
  PsiMinus: {
    label: 'Ψ⁻',
    symbol: '|Ψ⁻⟩',
    latex: '(|01⟩-|10⟩)/√2',
    amplitudes: [
      ZERO,
      { re: INV_SQRT2, im: 0 },
      { re: -INV_SQRT2, im: 0 },
      ZERO
    ],
    correlationA: [1, -1],
    correlationB: [-1, 1]
  }
};

function outerProduct(a: Complex[], b: Complex[]): Complex[][] {
  const rows = a.length;
  const cols = b.length;
  const result: Complex[][] = [];
  for (let i = 0; i < rows; i++) {
    result[i] = [];
    for (let j = 0; j < cols; j++) {
      result[i][j] = complexMult(a[i], { re: b[j].re, im: -b[j].im });
    }
  }
  return result;
}

function partialTrace(rho: Complex[][], traceOver: 'A' | 'B'): Complex[][] {
  const result: Complex[][] = [
    [ZERO, ZERO],
    [ZERO, ZERO]
  ];

  if (traceOver === 'A') {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        for (let k = 0; k < 2; k++) {
          result[i][j] = complexAdd(
            result[i][j],
            rho[k * 2 + i][k * 2 + j]
          );
        }
      }
    }
  } else {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        for (let k = 0; k < 2; k++) {
          result[i][j] = complexAdd(
            result[i][j],
            rho[i * 2 + k][j * 2 + k]
          );
        }
      }
    }
  }

  return result;
}

function blochVectorFromRho(rho: Complex[][]): BlochVector {
  const x = 2 * rho[0][1].re;
  const y = -2 * rho[0][1].im;
  const z = rho[0][0].re - rho[1][1].re;
  return { x, y, z };
}

function computeConcurrence(rho: Complex[][]): number {
  const sigmaY: Complex[][] = [
    [ZERO, { re: 0, im: -1 }],
    [{ re: 0, im: 1 }, ZERO]
  ];

  const sigmaYT: Complex[][] = [
    [{ re: sigmaY[0][0].re, im: -sigmaY[0][0].im }, { re: sigmaY[0][1].re, im: -sigmaY[0][1].im }],
    [{ re: sigmaY[1][0].re, im: -sigmaY[1][0].im }, { re: sigmaY[1][1].re, im: -sigmaY[1][1].im }]
  ];

  const sigmaYTensor: Complex[][] = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const row: Complex[] = [];
      for (let k = 0; k < 2; k++) {
        for (let l = 0; l < 2; l++) {
          row.push(complexMult(sigmaYT[i][k], sigmaYT[j][l]));
        }
      }
      sigmaYTensor.push(row);
    }
  }

  const rhoTilde: Complex[][] = [];
  for (let i = 0; i < 4; i++) {
    rhoTilde[i] = [];
    for (let j = 0; j < 4; j++) {
      let sum = ZERO;
      for (let k = 0; k < 4; k++) {
        for (let l = 0; l < 4; l++) {
          sum = complexAdd(
            sum,
            complexMult(
              complexMult(sigmaYTensor[i][k], rho[k][l]),
              sigmaYTensor[l][j]
            )
          );
        }
      }
      rhoTilde[i][j] = sum;
    }
  }

  const R: Complex[][] = [];
  for (let i = 0; i < 4; i++) {
    R[i] = [];
    for (let j = 0; j < 4; j++) {
      let sum = ZERO;
      for (let k = 0; k < 4; k++) {
        sum = complexAdd(sum, complexMult(rho[i][k], rhoTilde[k][j]));
      }
      R[i][j] = sum;
    }
  }

  const eigenvalues: number[] = [];
  for (let i = 0; i < 4; i++) {
    eigenvalues.push(Math.abs(complexAbsSq(R[i][i]) > 0 ? Math.sqrt(Math.max(0, R[i][i].re)) : 0));
  }

  eigenvalues.sort((a, b) => b - a);

  const c = Math.max(0, eigenvalues[0] - eigenvalues[1] - eigenvalues[2] - eigenvalues[3]);
  return Math.min(1, c);
}

export const createBellState = (type: BellStateType): TwoQubitState => {
  const config = BELL_STATES[type];
  const amplitudes = config.amplitudes;

  const densityMatrix = outerProduct([...amplitudes], [...amplitudes]);

  const reducedRhoA = partialTrace(densityMatrix, 'B');
  const reducedRhoB = partialTrace(densityMatrix, 'A');

  const blochVectorA = blochVectorFromRho(reducedRhoA);
  const blochVectorB = blochVectorFromRho(reducedRhoB);

  const concurrence = computeConcurrence(densityMatrix);

  return {
    amplitudes,
    densityMatrix,
    reducedRhoA,
    reducedRhoB,
    blochVectorA,
    blochVectorB,
    bellType: type,
    concurrence
  };
};

export const formatComplexShort = (c: Complex): string => {
  const re = c.re;
  const im = c.im;
  if (Math.abs(re) < 1e-6 && Math.abs(im) < 1e-6) return '0';
  if (Math.abs(im) < 1e-6) return re.toFixed(2);
  if (Math.abs(re) < 1e-6) return `${im >= 0 ? '' : '-'}${Math.abs(im).toFixed(2)}i`;
  return `${re.toFixed(2)}${im >= 0 ? '+' : '-'}${Math.abs(im).toFixed(2)}i`;
};

export const densityMatrixAbs = (rho: Complex[][]): number[][] => {
  return rho.map(row => row.map(c => Math.sqrt(complexAbsSq(c))));
};
