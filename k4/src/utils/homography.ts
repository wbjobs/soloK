import { Point, HomographyMatrix } from '../types';

export interface CalibrationResult {
  homography: HomographyMatrix | null;
  inliers: number[];
  reprojectionError: number;
  confidence: 'low' | 'medium' | 'high';
}

export function computeHomography(srcPoints: Point[], dstPoints: Point[]): HomographyMatrix | null {
  if (srcPoints.length < 4 || dstPoints.length < 4) return null;

  const n = srcPoints.length;
  const A: number[][] = [];

  for (let i = 0; i < n; i++) {
    const src = srcPoints[i];
    const dst = dstPoints[i];
    A.push([
      src.x, src.y, 1, 0, 0, 0, -dst.x * src.x, -dst.x * src.y, -dst.x
    ]);
    A.push([
      0, 0, 0, src.x, src.y, 1, -dst.y * src.x, -dst.y * src.y, -dst.y
    ]);
  }

  const result = solveSVD(A);
  if (!result) return null;

  return {
    h11: result[0], h12: result[1], h13: result[2],
    h21: result[3], h22: result[4], h23: result[5],
    h31: result[6], h32: result[7], h33: result[8]
  };
}

export function computeHomographyRANSAC(
  srcPoints: Point[],
  dstPoints: Point[],
  threshold: number = 5.0,
  maxIterations: number = 1000
): CalibrationResult {
  if (srcPoints.length < 4 || dstPoints.length < 4) {
    return { homography: null, inliers: [], reprojectionError: Infinity, confidence: 'low' };
  }

  const n = srcPoints.length;
  let bestInliers: number[] = [];
  let bestHomography: HomographyMatrix | null = null;
  let bestError = Infinity;

  for (let iter = 0; iter < maxIterations; iter++) {
    const sampleIndices = getRandomSample(n, 4);
    const sampleSrc = sampleIndices.map(i => srcPoints[i]);
    const sampleDst = sampleIndices.map(i => dstPoints[i]);

    const H = computeHomography(sampleSrc, sampleDst);
    if (!H) continue;

    const inliers: number[] = [];
    let totalError = 0;

    for (let i = 0; i < n; i++) {
      const projected = transformPoint(srcPoints[i], H);
      const error = Math.sqrt(
        Math.pow(projected.x - dstPoints[i].x, 2) +
        Math.pow(projected.y - dstPoints[i].y, 2)
      );
      
      if (error < threshold) {
        inliers.push(i);
        totalError += error;
      }
    }

    if (inliers.length >= 4 && inliers.length > bestInliers.length) {
      const finalH = computeHomography(
        inliers.map(i => srcPoints[i]),
        inliers.map(i => dstPoints[i])
      );
      
      if (finalH) {
        let finalError = 0;
        for (const i of inliers) {
          const projected = transformPoint(srcPoints[i], finalH);
          finalError += Math.sqrt(
            Math.pow(projected.x - dstPoints[i].x, 2) +
            Math.pow(projected.y - dstPoints[i].y, 2)
          );
        }
        finalError /= inliers.length;

        if (finalError < bestError) {
          bestInliers = inliers;
          bestHomography = finalH;
          bestError = finalError;
        }
      }
    }
  }

  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (bestHomography) {
    const inlierRatio = bestInliers.length / n;
    if (inlierRatio >= 0.8 && bestError < 3) {
      confidence = 'high';
    } else if (inlierRatio >= 0.6 && bestError < 8) {
      confidence = 'medium';
    }
  }

  return {
    homography: bestHomography,
    inliers: bestInliers,
    reprojectionError: bestError,
    confidence
  };
}

function getRandomSample(n: number, k: number): number[] {
  const indices: number[] = [];
  while (indices.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }
  return indices;
}

function solveSVD(A: number[][]): number[] | null {
  const n = A.length;
  const m = A[0].length;
  
  const AtA: number[][] = Array(m).fill(null).map(() => Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  const eigen = findSmallestEigenvector(AtA);
  return eigen;
}

function findSmallestEigenvector(matrix: number[][]): number[] | null {
  const n = matrix.length;
  let v = Array(n).fill(1);
  const maxIter = 1000;
  const tol = 1e-10;

  for (let iter = 0; iter < maxIter; iter++) {
    const Av = matrix.map(row => row.reduce((sum, val, i) => sum + val * v[i], 0));
    const norm = Math.sqrt(Av.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return null;
    
    const vNew = Av.map(val => val / norm);
    const diff = Math.sqrt(v.reduce((sum, val, i) => sum + Math.pow(val - vNew[i], 2), 0));
    
    v = vNew;
    if (diff < tol) break;
  }

  return v;
}

export function transformPoint(point: Point, H: HomographyMatrix): Point {
  const w = H.h31 * point.x + H.h32 * point.y + H.h33;
  if (Math.abs(w) < 1e-10) return { x: 0, y: 0 };
  return {
    x: (H.h11 * point.x + H.h12 * point.y + H.h13) / w,
    y: (H.h21 * point.x + H.h22 * point.y + H.h23) / w
  };
}

export function inverseHomography(H: HomographyMatrix): HomographyMatrix | null {
  const det = H.h11 * (H.h22 * H.h33 - H.h23 * H.h32)
            - H.h12 * (H.h21 * H.h33 - H.h23 * H.h31)
            + H.h13 * (H.h21 * H.h32 - H.h22 * H.h31);

  if (Math.abs(det) < 1e-10) return null;

  return {
    h11: (H.h22 * H.h33 - H.h23 * H.h32) / det,
    h12: (H.h13 * H.h32 - H.h12 * H.h33) / det,
    h13: (H.h12 * H.h23 - H.h13 * H.h22) / det,
    h21: (H.h23 * H.h31 - H.h21 * H.h33) / det,
    h22: (H.h11 * H.h33 - H.h13 * H.h31) / det,
    h23: (H.h13 * H.h21 - H.h11 * H.h23) / det,
    h31: (H.h21 * H.h32 - H.h22 * H.h31) / det,
    h32: (H.h12 * H.h31 - H.h11 * H.h32) / det,
    h33: (H.h11 * H.h22 - H.h12 * H.h21) / det
  };
}

export function calculateReprojectionError(
  srcPoints: Point[],
  dstPoints: Point[],
  H: HomographyMatrix
): number {
  if (srcPoints.length === 0) return Infinity;
  
  let totalError = 0;
  for (let i = 0; i < srcPoints.length; i++) {
    const projected = transformPoint(srcPoints[i], H);
    totalError += Math.sqrt(
      Math.pow(projected.x - dstPoints[i].x, 2) +
      Math.pow(projected.y - dstPoints[i].y, 2)
    );
  }
  return totalError / srcPoints.length;
}
