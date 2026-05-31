import type { EdgeDetectionParams } from '@/types';

import vertexSource from './shaders/vertex.glsl?raw';
import sobelSource from './shaders/sobel.frag?raw';
import laplacianSource from './shaders/laplacian.frag?raw';
import blurSource from './shaders/blur.frag?raw';
import gradientSource from './shaders/gradient.frag?raw';
import nmsSource from './shaders/nms.frag?raw';
import hysteresisSource from './shaders/hysteresis.frag?raw';
import copySource from './shaders/copy.frag?raw';

const MAX_PROCESS_SIZE = 2048;

interface FramebufferObject {
  fbo: WebGLFramebuffer | null;
  texture: WebGLTexture | null;
}

interface ProgramInfo {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private width = 0;
  private height = 0;
  private originalWidth = 0;
  private originalHeight = 0;
  private isDownsampled = false;
  private downsampleScale = 1;

  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;

  private sobelProgram: ProgramInfo | null = null;
  private laplacianProgram: ProgramInfo | null = null;
  private blurProgram: ProgramInfo | null = null;
  private gradientProgram: ProgramInfo | null = null;
  private nmsProgram: ProgramInfo | null = null;
  private hysteresisProgram: ProgramInfo | null = null;
  private copyProgram: ProgramInfo | null = null;

  private inputTexture: WebGLTexture | null = null;
  private originalTexture: WebGLTexture | null = null;
  private pingFbo: FramebufferObject | null = null;
  private pongFbo: FramebufferObject | null = null;
  private auxFbo: FramebufferObject | null = null;

  private textureCount = 0;

  public init(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      antialias: false,
    });

    if (!this.gl) {
      console.error('WebGL2 not supported');
      return false;
    }

    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    if (!this.createBuffers()) {
      this.dispose();
      return false;
    }

    if (!this.createPrograms()) {
      this.dispose();
      return false;
    }

    this.resize(canvas.width || 512, canvas.height || 512);

    return true;
  }

  public getIsDownsampled(): boolean {
    return this.isDownsampled;
  }

  public getDownsampleScale(): number {
    return this.downsampleScale;
  }

  private createBuffers(): boolean {
    if (!this.gl) return false;

    const quadVertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0,
    ]);

    const quadIndices = new Uint16Array([0, 1, 2, 2, 1, 3]);

    this.vertexBuffer = this.gl.createBuffer();
    if (!this.vertexBuffer) {
      console.error('Failed to create vertex buffer');
      return false;
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, quadVertices, this.gl.STATIC_DRAW);

    this.indexBuffer = this.gl.createBuffer();
    if (!this.indexBuffer) {
      console.error('Failed to create index buffer');
      return false;
    }

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, quadIndices, this.gl.STATIC_DRAW);

    return true;
  }

  private createPrograms(): boolean {
    this.sobelProgram = this.createProgramWithUniforms(vertexSource, sobelSource, [
      'u_image',
      'u_intensity',
      'u_grayscale',
    ]);

    if (!this.sobelProgram) {
      console.error('Failed to create Sobel program');
      return false;
    }

    this.laplacianProgram = this.createProgramWithUniforms(vertexSource, laplacianSource, [
      'u_image',
      'u_intensity',
      'u_grayscale',
      'u_kernelSize',
    ]);

    if (!this.laplacianProgram) {
      console.error('Failed to create Laplacian program');
      return false;
    }

    this.blurProgram = this.createProgramWithUniforms(vertexSource, blurSource, [
      'u_image',
      'u_kernelSize',
    ]);

    if (!this.blurProgram) {
      console.error('Failed to create Blur program');
      return false;
    }

    this.gradientProgram = this.createProgramWithUniforms(vertexSource, gradientSource, [
      'u_image',
    ]);

    if (!this.gradientProgram) {
      console.error('Failed to create Gradient program');
      return false;
    }

    this.nmsProgram = this.createProgramWithUniforms(vertexSource, nmsSource, [
      'u_gradient',
    ]);

    if (!this.nmsProgram) {
      console.error('Failed to create NMS program');
      return false;
    }

    this.hysteresisProgram = this.createProgramWithUniforms(vertexSource, hysteresisSource, [
      'u_nms',
      'u_original',
      'u_lowThreshold',
      'u_highThreshold',
      'u_intensity',
      'u_grayscale',
    ]);

    if (!this.hysteresisProgram) {
      console.error('Failed to create Hysteresis program');
      return false;
    }

    this.copyProgram = this.createProgramWithUniforms(vertexSource, copySource, ['u_image']);
    if (!this.copyProgram) {
      console.error('Failed to create Copy program');
      return false;
    }

    return true;
  }

  private createProgramWithUniforms(
    vertexSource: string,
    fragmentSource: string,
    uniformNames: string[]
  ): ProgramInfo | null {
    const program = this.createProgram(vertexSource, fragmentSource);
    if (!program) return null;

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uniforms[name] = this.gl!.getUniformLocation(program, name);
    }

    return { program, uniforms };
  }

  public compileShader(source: string, type: number): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) {
      console.error('Failed to create shader');
      return null;
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const infoLog = this.gl.getShaderInfoLog(shader);
      console.error(`Shader compile error: ${infoLog}\n${source}`);
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  public createProgram(
    vertexSource: string,
    fragmentSource: string
  ): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.compileShader(vertexSource, this.gl.VERTEX_SHADER);
    if (!vertexShader) return null;

    const fragmentShader = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      this.gl.deleteShader(vertexShader);
      return null;
    }

    const program = this.gl.createProgram();
    if (!program) {
      console.error('Failed to create program');
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      return null;
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const infoLog = this.gl.getProgramInfoLog(program);
      console.error(`Program link error: ${infoLog}`);
      this.gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  public createFramebuffer(
    width: number,
    height: number
  ): { fbo: WebGLFramebuffer | null; texture: WebGLTexture | null } {
    if (!this.gl) return { fbo: null, texture: null };

    const fbo = this.gl.createFramebuffer();
    if (!fbo) {
      console.error('Failed to create framebuffer');
      return { fbo: null, texture: null };
    }

    const texture = this.createEmptyTexture(width, height);
    if (!texture) {
      this.gl.deleteFramebuffer(fbo);
      return { fbo: null, texture: null };
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      texture,
      0
    );

    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      console.error(`Framebuffer incomplete: ${status}`);
      this.gl.deleteFramebuffer(fbo);
      this.gl.deleteTexture(texture);
      return { fbo: null, texture: null };
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

    return { fbo, texture };
  }

  private createEmptyTexture(width: number, height: number): WebGLTexture | null {
    if (!this.gl) return null;

    const texture = this.gl.createTexture();
    if (!texture) return null;

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.textureCount++;
    return texture;
  }

  public async loadImage(image: HTMLImageElement | HTMLCanvasElement): Promise<boolean> {
    if (!this.gl || !this.canvas) return false;

    this.originalWidth = image.width;
    this.originalHeight = image.height;

    let processWidth = image.width;
    let processHeight = image.height;
    this.isDownsampled = false;
    this.downsampleScale = 1;

    const maxDim = Math.max(image.width, image.height);
    if (maxDim > MAX_PROCESS_SIZE) {
      this.downsampleScale = MAX_PROCESS_SIZE / maxDim;
      processWidth = Math.round(image.width * this.downsampleScale);
      processHeight = Math.round(image.height * this.downsampleScale);
      this.isDownsampled = true;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = processWidth;
      tempCanvas.height = processHeight;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, processWidth, processHeight);
      }
    }

    this.deleteTexture(this.inputTexture);
    this.inputTexture = null;
    this.deleteTexture(this.originalTexture);
    this.originalTexture = null;

    this.width = processWidth;
    this.height = processHeight;
    this.canvas.width = processWidth;
    this.canvas.height = processHeight;
    this.resize(processWidth, processHeight);

    const imageSource = this.isDownsampled
      ? (() => {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = processWidth;
          tempCanvas.height = processHeight;
          const ctx = tempCanvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, 0, 0, processWidth, processHeight);
          return tempCanvas;
        })()
      : image;

    const texture = this.uploadTexture(imageSource);
    if (!texture) return false;
    this.inputTexture = texture;

    const originalTex = this.uploadTexture(imageSource);
    if (!originalTex) return false;
    this.originalTexture = originalTex;

    this.gl.bindTexture(this.gl.TEXTURE_2D, null);

    return true;
  }

  private uploadTexture(image: HTMLImageElement | HTMLCanvasElement): WebGLTexture | null {
    if (!this.gl) return null;

    const texture = this.gl.createTexture();
    if (!texture) {
      console.error('Failed to create texture');
      return null;
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      image
    );

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.textureCount++;
    return texture;
  }

  public resize(width: number, height: number): void {
    if (!this.gl || !this.canvas) return;

    if (this.width === width && this.height === height && this.pingFbo?.texture) {
      return;
    }

    this.width = width;
    this.height = height;

    this.deleteFramebuffer(this.pingFbo);
    this.deleteFramebuffer(this.pongFbo);
    this.deleteFramebuffer(this.auxFbo);

    this.pingFbo = this.createFramebuffer(width, height);
    this.pongFbo = this.createFramebuffer(width, height);
    this.auxFbo = this.createFramebuffer(width, height);
  }

  private deleteFramebuffer(fbo: FramebufferObject | null): void {
    if (!this.gl || !fbo) return;
    if (fbo.fbo) this.gl.deleteFramebuffer(fbo.fbo);
    this.deleteTexture(fbo.texture);
  }

  private deleteTexture(texture: WebGLTexture | null): void {
    if (!this.gl || !texture) return;
    this.gl.deleteTexture(texture);
    this.textureCount = Math.max(0, this.textureCount - 1);
  }

  private bindProgram(programInfo: ProgramInfo): void {
    if (!this.gl) return;
    this.gl.useProgram(programInfo.program);

    const positionLoc = this.gl.getAttribLocation(programInfo.program, 'a_position');
    const texCoordLoc = this.gl.getAttribLocation(programInfo.program, 'a_texCoord');

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    if (positionLoc >= 0) {
      this.gl.enableVertexAttribArray(positionLoc);
      this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);
    }
    if (texCoordLoc >= 0) {
      this.gl.enableVertexAttribArray(texCoordLoc);
      this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 0, 0);
    }

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  }

  private bindTexture(unit: number, texture: WebGLTexture | null, uniform: WebGLUniformLocation | null): void {
    if (!this.gl || !texture || uniform === null) return;
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.uniform1i(uniform, unit);
  }

  private renderToFramebuffer(fbo: FramebufferObject): void {
    if (!this.gl || !fbo.fbo) return;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo.fbo);
    this.gl.viewport(0, 0, this.width, this.height);
    this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
  }

  private copyTextureToScreen(texture: WebGLTexture | null): void {
    if (!this.gl || !this.copyProgram || !texture) return;

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.width, this.height);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.bindProgram(this.copyProgram);
    this.bindTexture(0, texture, this.copyProgram.uniforms.u_image);
    this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
  }

  private finish(): void {
    if (!this.gl) return;
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  public render(params: EdgeDetectionParams): number {
    if (!this.gl || !this.inputTexture || !this.pingFbo || !this.pongFbo || !this.auxFbo) return 0;

    const startTime = performance.now();
    this.gl.viewport(0, 0, this.width, this.height);

    let resultTexture: WebGLTexture | null = null;

    if (params.algorithm === 'canny') {
      let readTexture = this.inputTexture;
      let writeFbo = this.pingFbo;

      this.bindProgram(this.blurProgram!);
      this.gl.uniform1i(this.blurProgram!.uniforms.u_kernelSize, params.kernelSize);
      this.bindTexture(0, readTexture, this.blurProgram!.uniforms.u_image);
      this.renderToFramebuffer(writeFbo);

      readTexture = writeFbo.texture!;
      writeFbo = this.pongFbo;

      this.bindProgram(this.gradientProgram!);
      this.bindTexture(0, readTexture, this.gradientProgram!.uniforms.u_image);
      this.renderToFramebuffer(writeFbo);

      readTexture = writeFbo.texture!;
      writeFbo = this.auxFbo;

      this.bindProgram(this.nmsProgram!);
      this.bindTexture(0, readTexture, this.nmsProgram!.uniforms.u_gradient);
      this.renderToFramebuffer(writeFbo);

      readTexture = writeFbo.texture!;
      writeFbo = this.pingFbo;

      this.bindProgram(this.hysteresisProgram!);
      this.gl.uniform1f(this.hysteresisProgram!.uniforms.u_lowThreshold, params.lowThreshold);
      this.gl.uniform1f(this.hysteresisProgram!.uniforms.u_highThreshold, params.highThreshold);
      this.gl.uniform1f(this.hysteresisProgram!.uniforms.u_intensity, params.intensity);
      this.gl.uniform1i(this.hysteresisProgram!.uniforms.u_grayscale, params.grayscale ? 1 : 0);
      this.bindTexture(0, readTexture, this.hysteresisProgram!.uniforms.u_nms);
      this.bindTexture(1, this.originalTexture!, this.hysteresisProgram!.uniforms.u_original);
      this.renderToFramebuffer(writeFbo);

      resultTexture = writeFbo.texture!;
    } else if (params.algorithm === 'sobel') {
      this.bindProgram(this.sobelProgram!);
      this.gl.uniform1f(this.sobelProgram!.uniforms.u_intensity, params.intensity);
      this.gl.uniform1i(this.sobelProgram!.uniforms.u_grayscale, params.grayscale ? 1 : 0);
      this.bindTexture(0, this.inputTexture, this.sobelProgram!.uniforms.u_image);
      this.renderToFramebuffer(this.pingFbo);
      resultTexture = this.pingFbo.texture!;
    } else if (params.algorithm === 'laplacian') {
      this.bindProgram(this.laplacianProgram!);
      this.gl.uniform1i(this.laplacianProgram!.uniforms.u_kernelSize, params.kernelSize);
      this.gl.uniform1f(this.laplacianProgram!.uniforms.u_intensity, params.intensity);
      this.gl.uniform1i(this.laplacianProgram!.uniforms.u_grayscale, params.grayscale ? 1 : 0);
      this.bindTexture(0, this.inputTexture, this.laplacianProgram!.uniforms.u_image);
      this.renderToFramebuffer(this.pingFbo);
      resultTexture = this.pingFbo.texture!;
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.width, this.height);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    if (resultTexture) {
      this.copyTextureToScreen(resultTexture);
    }

    this.gl.finish();
    this.finish();

    const endTime = performance.now();
    return endTime - startTime;
  }

  public readPixels(): Uint8ClampedArray {
    if (!this.gl || !this.canvas) {
      return new Uint8ClampedArray();
    }

    const pixels = new Uint8ClampedArray(this.width * this.height * 4);
    this.gl.readPixels(0, 0, this.width, this.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);

    const flipped = new Uint8ClampedArray(this.width * this.height * 4);
    for (let y = 0; y < this.height; y++) {
      const srcRow = (this.height - 1 - y) * this.width * 4;
      const dstRow = y * this.width * 4;
      flipped.set(pixels.subarray(srcRow, srcRow + this.width * 4), dstRow);
    }

    return flipped;
  }

  public getGPUStats(): { memoryMB: number; textures: number } {
    const pixelCount = this.width * this.height;
    const fboCount = 3;
    const inputTexCount = 2;
    const totalPixels = pixelCount * (fboCount + inputTexCount);
    const bytesPerPixel = 4;
    const mipmapFactor = 1.33;
    const memoryBytes = totalPixels * bytesPerPixel * mipmapFactor;

    return {
      memoryMB: memoryBytes / (1024 * 1024),
      textures: this.textureCount,
    };
  }

  public dispose(): void {
    if (!this.gl) return;

    this.deleteTexture(this.inputTexture);
    this.deleteTexture(this.originalTexture);
    this.deleteFramebuffer(this.pingFbo);
    this.deleteFramebuffer(this.pongFbo);
    this.deleteFramebuffer(this.auxFbo);

    if (this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
    if (this.indexBuffer) this.gl.deleteBuffer(this.indexBuffer);

    if (this.sobelProgram) this.gl.deleteProgram(this.sobelProgram.program);
    if (this.laplacianProgram) this.gl.deleteProgram(this.laplacianProgram.program);
    if (this.blurProgram) this.gl.deleteProgram(this.blurProgram.program);
    if (this.gradientProgram) this.gl.deleteProgram(this.gradientProgram.program);
    if (this.nmsProgram) this.gl.deleteProgram(this.nmsProgram.program);
    if (this.hysteresisProgram) this.gl.deleteProgram(this.hysteresisProgram.program);
    if (this.copyProgram) this.gl.deleteProgram(this.copyProgram.program);

    this.inputTexture = null;
    this.originalTexture = null;
    this.pingFbo = null;
    this.pongFbo = null;
    this.auxFbo = null;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.sobelProgram = null;
    this.laplacianProgram = null;
    this.blurProgram = null;
    this.gradientProgram = null;
    this.nmsProgram = null;
    this.hysteresisProgram = null;
    this.copyProgram = null;

    const loseCtx = this.gl.getExtension('WEBGL_lose_context');
    if (loseCtx) loseCtx.loseContext();

    this.gl = null;
    this.canvas = null;
  }
}
