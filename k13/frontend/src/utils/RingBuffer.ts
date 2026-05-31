/**
 * Circular ring buffer for efficiently storing and accessing the most recent N samples.
 * Optimized for append-only streaming and read access to the last M samples.
 */
export class RingBuffer {
  private _nChan: number;
  private _maxSamples: number;
  private _buf: Float32Array[]; // array of channel buffers
  private _writeIdx: number = 0;
  private _count: number = 0;

  constructor(nChan: number, maxSamples: number) {
    this._nChan = nChan;
    this._maxSamples = maxSamples;
    this._buf = Array.from({ length: nChan }, () => new Float32Array(maxSamples));
  }

  get nChan(): number {
    return this._nChan;
  }

  get maxSamples(): number {
    return this._maxSamples;
  }

  get count(): number {
    return this._count;
  }

  /** Append new samples. newSamples shape: (n_chan, n_samples) */
  push(newSamples: Float32Array[] | number[][]): void {
    const n = newSamples[0].length;
    if (n === 0) return;
    for (let ch = 0; ch < this._nChan; ch++) {
      const src = newSamples[ch];
      const dst = this._buf[ch];
      for (let i = 0; i < n; i++) {
        dst[(this._writeIdx + i) % this._maxSamples] = src[i];
      }
    }
    this._writeIdx = (this._writeIdx + n) % this._maxSamples;
    this._count = Math.min(this._count + n, this._maxSamples);
  }

  /**
   * Read the last `n` samples for all channels.
   * Returns (n_chan, n) as a 2D array of Float32Array (copy).
   */
  readLast(n: number): Float32Array[] {
    const m = Math.min(n, this._count);
    const out: Float32Array[] = [];
    const start = (this._writeIdx - m + this._maxSamples) % this._maxSamples;
    for (let ch = 0; ch < this._nChan; ch++) {
      const src = this._buf[ch];
      const dst = new Float32Array(m);
      if (start + m <= this._maxSamples) {
        dst.set(src.subarray(start, start + m));
      } else {
        const first = this._maxSamples - start;
        dst.set(src.subarray(start, this._maxSamples), 0);
        dst.set(src.subarray(0, m - first), first);
      }
      out.push(dst);
    }
    return out;
  }

  /** Reset buffer */
  clear(): void {
    this._writeIdx = 0;
    this._count = 0;
  }
}
