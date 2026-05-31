import { SIMULATE_VERT, SIMULATE_FRAG, RENDER_FRAG, CLEAR_FRAG } from './shaders';

export class GOLSimulator {
    private gl: WebGL2RenderingContext;
    private gridSize: number;
    private currentIndex = 0;

    private stateTextures: [WebGLTexture, WebGLTexture] = [null!, null!];
    private ageTextures: [WebGLTexture, WebGLTexture] = [null!, null!];
    private simFBOs: [WebGLFramebuffer, WebGLFramebuffer] = [null!, null!];
    private vao: WebGLVertexArrayObject = null!;
    private quadVBO: WebGLBuffer = null!;

    private simProgram: WebGLProgram = null!;
    private renderProgram: WebGLProgram = null!;
    private clearProgram: WebGLProgram = null!;

    private simUniforms: Record<string, WebGLUniformLocation> = {};
    private renderUniforms: Record<string, WebGLUniformLocation> = {};
    private clearUniforms: Record<string, WebGLUniformLocation> = {};

    private heatmapEnabled = false;
    private zoom = 1.0;
    private offsetX = 0.0;
    private offsetY = 0.0;
    private heatStep: number;

    readState(): Uint8Array {
        const gl = this.gl;
        const readIdx = this.currentIndex;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFBOs[readIdx]);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        const data = new Uint8Array(this.gridSize * this.gridSize * 4);
        gl.readPixels(0, 0, this.gridSize, this.gridSize, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return data;
    }

    countLiveCells(): number {
        const data = this.readState();
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 128) count++;
        }
        return count;
    }

    constructor(private canvas: HTMLCanvasElement, gridSize = 512) {
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
        });
        if (!gl) throw new Error('WebGL2 not supported');
        this.gl = gl;
        this.gridSize = gridSize;
        this.heatStep = 1.0 / 200.0;
    }

    init(): void {
        const gl = this.gl;
        gl.getExtension('EXT_color_buffer_float');

        this.createQuad();
        this.compileShaders();
        this.createTextures();
        this.createFBOs();
        this.clearAll();
    }

    private createQuad(): void {
        const gl = this.gl;
        this.vao = gl.createVertexArray()!;
        this.quadVBO = gl.createBuffer()!;

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1, 1, 1,
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    private compileShader(type: number, source: string): WebGLShader {
        const gl = this.gl;
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('Shader compile error: ' + info);
        }
        return shader;
    }

    private linkProgram(vs: WebGLShader, fs: WebGLShader): WebGLProgram {
        const gl = this.gl;
        const prog = gl.createProgram()!;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.bindAttribLocation(prog, 0, 'aPosition');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(prog);
            gl.deleteProgram(prog);
            throw new Error('Program link error: ' + info);
        }
        return prog;
    }

    private compileShaders(): void {
        const gl = this.gl;

        const vs = this.compileShader(gl.VERTEX_SHADER, SIMULATE_VERT);
        const simFS = this.compileShader(gl.FRAGMENT_SHADER, SIMULATE_FRAG);
        this.simProgram = this.linkProgram(vs, simFS);
        gl.deleteShader(simFS);

        const renderFS = this.compileShader(gl.FRAGMENT_SHADER, RENDER_FRAG);
        this.renderProgram = this.linkProgram(vs, renderFS);
        gl.deleteShader(renderFS);

        const clearFS = this.compileShader(gl.FRAGMENT_SHADER, CLEAR_FRAG);
        this.clearProgram = this.linkProgram(vs, clearFS);
        gl.deleteShader(clearFS);
        gl.deleteShader(vs);

        this.cacheUniforms(this.simProgram, ['uState', 'uAge', 'uHeatStep'], this.simUniforms);
        this.cacheUniforms(this.renderProgram, ['uState', 'uAge', 'uHeatmap', 'uResolution', 'uGridSize', 'uOffset', 'uZoom'], this.renderUniforms);
        this.cacheUniforms(this.clearProgram, ['uClearValue'], this.clearUniforms);
    }

    private cacheUniforms(prog: WebGLProgram, names: string[], cache: Record<string, WebGLUniformLocation>): void {
        for (const n of names) {
            cache[n] = this.gl.getUniformLocation(prog, n)!;
        }
    }

    private createTexture(width: number, height: number, data?: Uint8Array): WebGLTexture {
        const gl = this.gl;
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    private createTextures(): void {
        const s = this.gridSize;
        this.stateTextures = [this.createTexture(s, s), this.createTexture(s, s)];
        this.ageTextures = [this.createTexture(s, s), this.createTexture(s, s)];
    }

    private createFBOs(): void {
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            const fbo = gl.createFramebuffer()!;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.stateTextures[i], 0);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.ageTextures[i], 0);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.warn('FBO incomplete:', status);
            }
            this.simFBOs[i] = fbo;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private clearAll(): void {
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFBOs[i]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
            gl.viewport(0, 0, this.gridSize, this.gridSize);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    step(): void {
        const gl = this.gl;
        const readIdx = this.currentIndex;
        const writeIdx = 1 - this.currentIndex;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFBOs[writeIdx]);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.viewport(0, 0, this.gridSize, this.gridSize);

        gl.useProgram(this.simProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.stateTextures[readIdx]);
        gl.uniform1i(this.simUniforms.uState, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.ageTextures[readIdx]);
        gl.uniform1i(this.simUniforms.uAge, 1);

        gl.uniform1f(this.simUniforms.uHeatStep, this.heatStep);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        this.currentIndex = writeIdx;
    }

    render(): void {
        const gl = this.gl;
        const readIdx = this.currentIndex;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        gl.useProgram(this.renderProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.stateTextures[readIdx]);
        gl.uniform1i(this.renderUniforms.uState, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.ageTextures[readIdx]);
        gl.uniform1i(this.renderUniforms.uAge, 1);

        gl.uniform1i(this.renderUniforms.uHeatmap, this.heatmapEnabled ? 1 : 0);
        gl.uniform2f(this.renderUniforms.uResolution, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.renderUniforms.uGridSize, this.gridSize, this.gridSize);
        gl.uniform2f(this.renderUniforms.uOffset, this.offsetX, this.offsetY);
        gl.uniform1f(this.renderUniforms.uZoom, this.zoom);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    reset(): void {
        this.currentIndex = 0;
        this.clearAll();
        this.zoom = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    setCell(x: number, y: number, alive: boolean): void {
        const gl = this.gl;
        const readIdx = this.currentIndex;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const value = alive ? 255 : 0;
        const stateData = new Uint8Array([value, 0, 0, 255]);
        gl.bindTexture(gl.TEXTURE_2D, this.stateTextures[readIdx]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, stateData);

        const ageData = new Uint8Array(alive ? [0, 0, 0, 255] : [0, 0, 0, 255]);
        gl.bindTexture(gl.TEXTURE_2D, this.ageTextures[readIdx]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ageData);
    }

    setCells(cells: [number, number][], alive: boolean): void {
        const gl = this.gl;
        const readIdx = this.currentIndex;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const value = alive ? 255 : 0;
        const pixel = new Uint8Array([value, 0, 0, 255]);
        const agePixel = new Uint8Array([0, 0, 0, 255]);

        gl.bindTexture(gl.TEXTURE_2D, this.stateTextures[readIdx]);
        for (const [x, y] of cells) {
            const gx = ((x % this.gridSize) + this.gridSize) % this.gridSize;
            const gy = ((y % this.gridSize) + this.gridSize) % this.gridSize;
            gl.texSubImage2D(gl.TEXTURE_2D, 0, gx, gy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        }

        gl.bindTexture(gl.TEXTURE_2D, this.ageTextures[readIdx]);
        for (const [x, y] of cells) {
            const gx = ((x % this.gridSize) + this.gridSize) % this.gridSize;
            const gy = ((y % this.gridSize) + this.gridSize) % this.gridSize;
            gl.texSubImage2D(gl.TEXTURE_2D, 0, gx, gy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, agePixel);
        }
    }

    placePattern(cells: [number, number][], cx: number, cy: number): void {
        const shifted = cells.map(([x, y]): [number, number] => [x + cx, y + cy]);
        this.setCells(shifted, true);
    }

    setHeatmap(enabled: boolean): void {
        this.heatmapEnabled = enabled;
    }

    setZoom(z: number): void {
        this.zoom = Math.max(0.5, Math.min(z, 20.0));
    }

    getZoom(): number {
        return this.zoom;
    }

    setOffset(x: number, y: number): void {
        this.offsetX = x;
        this.offsetY = y;
    }

    getOffset(): [number, number] {
        return [this.offsetX, this.offsetY];
    }

    screenToGrid(sx: number, sy: number): [number, number] {
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = (sx - rect.left) / rect.width;
        const ndcY = 1.0 - (sy - rect.top) / rect.height;

        const aspect = rect.width / rect.height;
        let uvX = ndcX;
        let uvY = ndcY;
        if (aspect > 1.0) {
            uvX = (ndcX - 0.5) * aspect + 0.5;
        } else {
            uvY = (ndcY - 0.5) / aspect + 0.5;
        }

        const gridXf = ((uvX - 0.5) / this.zoom + 0.5 - this.offsetX) * this.gridSize;
        const gridYf = ((uvY - 0.5) / this.zoom + 0.5 - this.offsetY) * this.gridSize;

        const gx = ((Math.floor(gridXf) % this.gridSize) + this.gridSize) % this.gridSize;
        const gy = ((Math.floor(gridYf) % this.gridSize) + this.gridSize) % this.gridSize;
        return [gx, gy];
    }

    getGridSize(): number {
        return this.gridSize;
    }

    resize(width: number, height: number): void {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(width * dpr);
        const h = Math.floor(height * dpr);
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }

    randomize(density: number = 0.3): void {
        const gl = this.gl;
        const size = this.gridSize * this.gridSize;
        const stateData = new Uint8Array(size * 4);
        const ageData = new Uint8Array(size * 4);
        for (let i = 0; i < size; i++) {
            const alive = Math.random() < density ? 255 : 0;
            stateData[i * 4] = alive;
            stateData[i * 4 + 3] = 255;
            ageData[i * 4 + 3] = 255;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const readIdx = this.currentIndex;
        gl.bindTexture(gl.TEXTURE_2D, this.stateTextures[readIdx]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridSize, this.gridSize, gl.RGBA, gl.UNSIGNED_BYTE, stateData);

        gl.bindTexture(gl.TEXTURE_2D, this.ageTextures[readIdx]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridSize, this.gridSize, gl.RGBA, gl.UNSIGNED_BYTE, ageData);
    }

    dispose(): void {
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            gl.deleteTexture(this.stateTextures[i]);
            gl.deleteTexture(this.ageTextures[i]);
            gl.deleteFramebuffer(this.simFBOs[i]);
        }
        gl.deleteBuffer(this.quadVBO);
        gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.simProgram);
        gl.deleteProgram(this.renderProgram);
        gl.deleteProgram(this.clearProgram);
    }
}
