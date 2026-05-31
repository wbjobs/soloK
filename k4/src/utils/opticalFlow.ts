import { Point } from '../types';

export interface TrackedPoint {
  id: string;
  position: Point;
  previousPosition: Point;
  velocity: Point;
  confidence: number;
  type: 'attacker' | 'defender';
  searchWindow: number;
}

export interface FlowResult {
  flow: Float32Array;
  computed: boolean;
}

const PYRAMID_LEVELS = 3;

function gaussianBlur(imageData: ImageData, sigma: number): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const result = new ImageData(width, height);
  
  const kernelSize = Math.ceil(sigma * 3) * 2 + 1;
  const kernel: number[] = [];
  let sum = 0;
  
  for (let i = 0; i < kernelSize; i++) {
    const x = i - (kernelSize - 1) / 2;
    const val = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(val);
    sum += val;
  }
  
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }
  
  const temp = new Uint8ClampedArray(data.length);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < kernelSize; k++) {
        const xk = Math.min(Math.max(x + k - (kernelSize - 1) / 2, 0), width - 1);
        const idx = (y * width + xk) * 4;
        r += data[idx] * kernel[k];
        g += data[idx + 1] * kernel[k];
        b += data[idx + 2] * kernel[k];
      }
      const idx = (y * width + x) * 4;
      temp[idx] = r;
      temp[idx + 1] = g;
      temp[idx + 2] = b;
      temp[idx + 3] = 255;
    }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < kernelSize; k++) {
        const yk = Math.min(Math.max(y + k - (kernelSize - 1) / 2, 0), height - 1);
        const idx = (yk * width + x) * 4;
        r += temp[idx] * kernel[k];
        g += temp[idx + 1] * kernel[k];
        b += temp[idx + 2] * kernel[k];
      }
      const idx = (y * width + x) * 4;
      result.data[idx] = r;
      result.data[idx + 1] = g;
      result.data[idx + 2] = b;
      result.data[idx + 3] = 255;
    }
  }
  
  return result;
}

function toGrayscale(imageData: ImageData): Uint8Array {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const gray = new Uint8Array(width * height);
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  return gray;
}

function buildPyramid(image: Uint8Array, width: number, height: number, levels: number): Uint8Array[] {
  const pyramid: Uint8Array[] = [image];
  
  for (let level = 1; level < levels; level++) {
    const prev = pyramid[level - 1];
    const prevW = Math.floor(width / Math.pow(2, level - 1));
    const prevH = Math.floor(height / Math.pow(2, level - 1));
    const newW = Math.floor(prevW / 2);
    const newH = Math.floor(prevH / 2);
    const next = new Uint8Array(newW * newH);
    
    for (let y = 0; y < newH; y++) {
      for (let x = 0; x < newW; x++) {
        let sum = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const px = Math.min(x * 2 + dx, prevW - 1);
            const py = Math.min(y * 2 + dy, prevH - 1);
            sum += prev[py * prevW + px];
          }
        }
        next[y * newW + x] = sum / 4;
      }
    }
    
    pyramid.push(next);
  }
  
  return pyramid;
}

function computeGradients(image: Uint8Array, width: number, height: number): { Ix: Float32Array; Iy: Float32Array } {
  const Ix = new Float32Array(width * height);
  const Iy = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      Ix[idx] = (image[idx + 1] - image[idx - 1]) / 2;
      Iy[idx] = (image[idx + width] - image[idx - width]) / 2;
    }
  }
  
  return { Ix, Iy };
}

export function computeFarnebackFlow(
  prevFrame: ImageData,
  currFrame: ImageData,
  points: TrackedPoint[]
): TrackedPoint[] {
  const width = prevFrame.width;
  const height = prevFrame.height;
  
  const prevBlur = gaussianBlur(prevFrame, 0.8);
  const currBlur = gaussianBlur(currFrame, 0.8);
  
  const prevGray = toGrayscale(prevBlur);
  const currGray = toGrayscale(currBlur);
  
  const prevPyramid = buildPyramid(prevGray, width, height, PYRAMID_LEVELS);
  const currPyramid = buildPyramid(currGray, width, height, PYRAMID_LEVELS);
  
  return points.map(point => {
    let flowX = 0;
    let flowY = 0;
    let totalConfidence = 0;
    
    for (let level = PYRAMID_LEVELS - 1; level >= 0; level--) {
      const scale = Math.pow(2, level);
      const levelW = Math.floor(width / scale);
      const levelH = Math.floor(height / scale);
      
      const px = Math.floor(point.position.x / scale);
      const py = Math.floor(point.position.y / scale);
      
      const searchRadius = Math.max(3, Math.floor(point.searchWindow / scale / 2));
      
      const x0 = Math.max(1, px - searchRadius);
      const x1 = Math.min(levelW - 2, px + searchRadius);
      const y0 = Math.max(1, py - searchRadius);
      const y1 = Math.min(levelH - 2, py + searchRadius);
      
      const prevImg = prevPyramid[level];
      const currImg = currPyramid[level];
      
      computeGradients(currImg, levelW, levelH);
      
      let bestDx = 0;
      let bestDy = 0;
      let bestMatch = Infinity;
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          let errSum = 0;
          let count = 0;
          
          for (let wy = y0; wy <= y1; wy++) {
            for (let wx = x0; wx <= x1; wx++) {
              const currIdx = wy * levelW + wx;
              const prevX = wx - dx - Math.round(flowX);
              const prevY = wy - dy - Math.round(flowY);
              
              if (prevX >= 0 && prevX < levelW && prevY >= 0 && prevY < levelH) {
                const prevIdx = prevY * levelW + prevX;
                const diff = currImg[currIdx] - prevImg[prevIdx];
                errSum += diff * diff;
                count++;
              }
            }
          }
          
          if (count > 0) {
            const avgErr = errSum / count;
            if (avgErr < bestMatch) {
              bestMatch = avgErr;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
      }
      
      flowX += bestDx * scale;
      flowY += bestDy * scale;
      
      const confidence = Math.max(0, 1 - bestMatch / (255 * 255));
      totalConfidence += confidence / PYRAMID_LEVELS;
    }
    
    const newPosition: Point = {
      x: point.position.x + flowX,
      y: point.position.y + flowY,
    };
    
    newPosition.x = Math.max(0, Math.min(width, newPosition.x));
    newPosition.y = Math.max(0, Math.min(height, newPosition.y));
    
    const velocity: Point = {
      x: flowX,
      y: flowY,
    };
    
    const speed = Math.sqrt(flowX * flowX + flowY * flowY);
    const finalConfidence = Math.max(0.2, Math.min(1, totalConfidence * (1 - speed / 50)));
    
    return {
      ...point,
      previousPosition: point.position,
      position: newPosition,
      velocity,
      confidence: finalConfidence,
    };
  });
}

export function trackPoints(
  prevFrame: ImageData | null,
  currFrame: ImageData,
  points: TrackedPoint[]
): TrackedPoint[] {
  if (!prevFrame || points.length === 0) {
    return points.map(p => ({
      ...p,
      confidence: 1.0,
      velocity: { x: 0, y: 0 },
    }));
  }
  
  if (prevFrame.width !== currFrame.width || prevFrame.height !== currFrame.height) {
    return points.map(p => ({
      ...p,
      confidence: 0.5,
      velocity: { x: 0, y: 0 },
    }));
  }
  
  return computeFarnebackFlow(prevFrame, currFrame, points);
}

export function getTrackedBoundingBox(
  point: Point,
  size: number = 40
): { x: number; y: number; width: number; height: number } {
  return {
    x: point.x - size / 2,
    y: point.y - size / 2,
    width: size,
    height: size,
  };
}
