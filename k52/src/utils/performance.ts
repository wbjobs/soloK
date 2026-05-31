class PerformanceMonitor {
  private frameCount: number = 0;
  private lastFpsUpdateTime: number = 0;
  private fpsValues: number[] = [];
  private processTimes: Record<string, { start: number; values: number[] }> = {};

  startFrame(): void {
    this.frameCount++;
    const now = performance.now();
    if (this.lastFpsUpdateTime === 0) {
      this.lastFpsUpdateTime = now;
    }
  }

  endFrame(): number {
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdateTime;

    if (elapsed >= 1000) {
      const fps = (this.frameCount * 1000) / elapsed;
      this.fpsValues.push(fps);
      if (this.fpsValues.length > 60) {
        this.fpsValues.shift();
      }
      this.frameCount = 0;
      this.lastFpsUpdateTime = now;
    }

    return this.getFps();
  }

  startProcess(algorithm: string): void {
    if (!this.processTimes[algorithm]) {
      this.processTimes[algorithm] = { start: 0, values: [] };
    }
    this.processTimes[algorithm].start = performance.now();
  }

  endProcess(algorithm: string): number {
    const now = performance.now();
    const processData = this.processTimes[algorithm];
    if (!processData) {
      return 0;
    }

    const duration = now - processData.start;
    processData.values.push(duration);
    if (processData.values.length > 60) {
      processData.values.shift();
    }

    return duration;
  }

  getFps(): number {
    if (this.fpsValues.length === 0) {
      return 0;
    }
    const sum = this.fpsValues.reduce((a, b) => a + b, 0);
    return sum / this.fpsValues.length;
  }

  getProcessTime(algorithm: string): number {
    const processData = this.processTimes[algorithm];
    if (!processData || processData.values.length === 0) {
      return 0;
    }
    return processData.values[processData.values.length - 1];
  }

  getAverageProcessTime(algorithm: string, window?: number): number {
    const processData = this.processTimes[algorithm];
    if (!processData || processData.values.length === 0) {
      return 0;
    }

    const values = window
      ? processData.values.slice(-window)
      : processData.values;

    if (values.length === 0) {
      return 0;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  reset(): void {
    this.frameCount = 0;
    this.lastFpsUpdateTime = 0;
    this.fpsValues = [];
    this.processTimes = {};
  }
}

export function estimateGPUMemory(
  width: number,
  height: number,
  channels: number = 4
): number {
  const baseBytes = width * height * channels * 4;
  const mipmapFactor = 1.33;
  const totalBytes = baseBytes * mipmapFactor;
  return totalBytes / (1024 * 1024);
}

export const performanceMonitor = new PerformanceMonitor();
