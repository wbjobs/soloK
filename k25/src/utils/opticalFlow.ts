export interface FlowVector {
  x: number;
  y: number;
  u: number;
  v: number;
}

export class OpticalFlowCalculator {
  private prevData: ImageData | null = null;
  private gridSize: number = 10;

  calculate(currentData: ImageData): FlowVector[] {
    const vectors: FlowVector[] = [];
    
    if (!this.prevData) {
      this.prevData = currentData;
      return vectors;
    }

    const width = currentData.width;
    const height = currentData.height;

    for (let y = this.gridSize; y < height - this.gridSize; y += this.gridSize) {
      for (let x = this.gridSize; x < width - this.gridSize; x += this.gridSize) {
        const flow = this.calculateFlowAtPoint(
          this.prevData,
          currentData,
          x,
          y,
          width,
          height
        );
        
        if (Math.abs(flow.u) > 1 || Math.abs(flow.v) > 1) {
          vectors.push({ x, y, u: flow.u, v: flow.v });
        }
      }
    }

    this.prevData = currentData;
    return vectors;
  }

  private calculateFlowAtPoint(
    prev: ImageData,
    curr: ImageData,
    x: number,
    y: number,
    width: number,
    height: number
  ): { u: number; v: number } {
    const windowSize = 5;
    let sumIx = 0, sumIy = 0, sumIt = 0;
    let sumIx2 = 0, sumIy2 = 0, sumIxIy = 0;
    let sumIxIt = 0, sumIyIt = 0;

    for (let dy = -windowSize; dy <= windowSize; dy++) {
      for (let dx = -windowSize; dx <= windowSize; dx++) {
        const px = Math.min(Math.max(x + dx, 0), width - 1);
        const py = Math.min(Math.max(y + dy, 0), height - 1);
        const idx = (py * width + px) * 4;

        const prevGray = this.getGrayScale(prev, idx);
        const currGray = this.getGrayScale(curr, idx);
        
        const rightGray = px < width - 1 ? this.getGrayScale(curr, idx + 4) : currGray;
        const bottomGray = py < height - 1 ? this.getGrayScale(curr, idx + width * 4) : currGray;

        const Ix = rightGray - prevGray;
        const Iy = bottomGray - prevGray;
        const It = currGray - prevGray;

        sumIx += Ix;
        sumIy += Iy;
        sumIt += It;
        sumIx2 += Ix * Ix;
        sumIy2 += Iy * Iy;
        sumIxIy += Ix * Iy;
        sumIxIt += Ix * It;
        sumIyIt += Iy * It;
      }
    }

    const det = sumIx2 * sumIy2 - sumIxIy * sumIxIy;
    if (Math.abs(det) < 1e-6) return { u: 0, v: 0 };

    const u = (sumIxIy * sumIyIt - sumIy2 * sumIxIt) / det;
    const v = (sumIxIy * sumIxIt - sumIx2 * sumIyIt) / det;

    return { u, v };
  }

  private getGrayScale(data: ImageData, idx: number): number {
    return (data.data[idx] + data.data[idx + 1] + data.data[idx + 2]) / 3;
  }

  reset() {
    this.prevData = null;
  }
}

export const analyzeFlowDirection = (
  vectors: FlowVector[],
  escalatorDirection: 'up' | 'down' | 'left' | 'right'
): { isRetrograde: boolean; confidence: number } => {
  if (vectors.length === 0) return { isRetrograde: false, confidence: 0 };

  let retrogradeCount = 0;
  let totalMagnitude = 0;

  vectors.forEach(vec => {
    const magnitude = Math.sqrt(vec.u * vec.u + vec.v * vec.v);
    totalMagnitude += magnitude;

    let isOpposite = false;
    switch (escalatorDirection) {
      case 'up':
        isOpposite = vec.v > 2;
        break;
      case 'down':
        isOpposite = vec.v < -2;
        break;
      case 'left':
        isOpposite = vec.u > 2;
        break;
      case 'right':
        isOpposite = vec.u < -2;
        break;
    }

    if (isOpposite && magnitude > 3) {
      retrogradeCount++;
    }
  });

  const ratio = retrogradeCount / vectors.length;
  return {
    isRetrograde: ratio > 0.3,
    confidence: Math.min(1, ratio * 2)
  };
};
