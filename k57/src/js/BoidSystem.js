import * as THREE from 'three';
import GPUComputationRenderer from './GPUComputationRenderer.js';

import particleVertexShader from '../shaders/particleVertex.glsl?raw';
import particleFragmentShader from '../shaders/particleFragment.glsl?raw';
import positionFragmentShader from '../shaders/positionFragment.glsl?raw';
import velocityFragmentShader from '../shaders/velocityFragment.glsl?raw';
import roleFragmentShader from '../shaders/roleFragment.glsl?raw';
import trailVertexShader from '../shaders/trailVertex.glsl?raw';

class BoidSystem {
  constructor(renderer, params) {
    this.renderer = renderer;
    this.particleCount = params.particleCount || 5000;
    this.bounds = params.bounds || { min: new THREE.Vector3(-10, -10, -10), max: new THREE.Vector3(10, 10, 10) };
    this.maxTrailLength = Math.min(params.trailLength || 20, 32);
    
    this.maxTrailRenderPoints = Math.min(8, Math.floor(this.maxTrailLength / 2));
    this.trailUpdateFrequency = 2;
    this.frameCounter = 0;
    
    this.params = {
      separation: params.separation || 1.5,
      alignment: params.alignment || 1.0,
      cohesion: params.cohesion || 1.0,
      maxSpeed: params.maxSpeed || 0.8,
      perceptionRadius: params.perceptionRadius || 2.5,
      bounce: params.bounce || 1.0,
      particleSize: params.particleSize || 3.0,
      trailLength: this.maxTrailLength,
      chaseWeight: params.chaseWeight || 2.0,
      fleeWeight: params.fleeWeight || 3.0,
      catchRadius: params.catchRadius || 0.5,
      predatorRatio: params.predatorRatio || 0.15
    };
    
    this.textureSize = Math.ceil(Math.sqrt(this.particleCount));
    this.gpuCompute = null;
    this.positionVariable = null;
    this.velocityVariable = null;
    this.roleVariable = null;
    
    this.particles = null;
    this.trailParticles = null;
    
    this.trailHistoryRT = null;
    this.trailHistoryMaterial = null;
    this.trailHistoryScene = null;
    this.trailHistoryCamera = null;
    this.currentTrailIndex = 0;
    
    this.populationHistory = { predator: [], prey: [] };
    this.maxHistoryLength = 300;
    this.populationReadInterval = 30;
    this.readBuffer = null;
    
    this._isDisposed = false;
    
    this.init();
  }
  
  init() {
    this.initGPUCompute();
    this.initTrailHistory();
    this.initParticles();
    this.initTrailRender();
    this.initReadBuffer();
  }
  
  initGPUCompute() {
    this.gpuCompute = new GPUComputationRenderer(
      this.textureSize,
      this.textureSize,
      this.renderer
    );
    
    const positions = new Float32Array(this.textureSize * this.textureSize * 4);
    const velocities = new Float32Array(this.textureSize * this.textureSize * 4);
    const roles = new Float32Array(this.textureSize * this.textureSize * 4);
    
    const range = this.bounds.max.clone().sub(this.bounds.min);
    
    for (let i = 0; i < this.particleCount; i++) {
      const i4 = i * 4;
      
      positions[i4] = this.bounds.min.x + Math.random() * range.x;
      positions[i4 + 1] = this.bounds.min.y + Math.random() * range.y;
      positions[i4 + 2] = this.bounds.min.z + Math.random() * range.z;
      positions[i4 + 3] = 1;
      
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = this.params.maxSpeed * (0.5 + Math.random() * 0.5);
      
      velocities[i4] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i4 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i4 + 2] = Math.cos(phi) * speed;
      velocities[i4 + 3] = 1;
      
      const isPredator = Math.random() < this.params.predatorRatio;
      roles[i4] = isPredator ? 1.0 : 0.0;
      roles[i4 + 1] = isPredator ? 5.0 : 2.0;
      roles[i4 + 2] = 0.0;
      roles[i4 + 3] = 1.0;
    }
    
    const positionTexture = this.gpuCompute.createTexture();
    const velocityTexture = this.gpuCompute.createTexture();
    const roleTexture = this.gpuCompute.createTexture();
    
    positionTexture.image.data.set(positions);
    velocityTexture.image.data.set(velocities);
    roleTexture.image.data.set(roles);
    
    const velocityUniforms = {
      separationWeight: { value: this.params.separation },
      alignmentWeight: { value: this.params.alignment },
      cohesionWeight: { value: this.params.cohesion },
      maxSpeed: { value: this.params.maxSpeed },
      perceptionRadius: { value: this.params.perceptionRadius },
      maxForce: { value: 0.1 },
      chaseWeight: { value: this.params.chaseWeight },
      fleeWeight: { value: this.params.fleeWeight },
      catchRadius: { value: this.params.catchRadius },
      textureSize: { value: this.textureSize },
      particleCount: { value: this.particleCount }
    };
    
    const positionUniforms = {
      maxSpeed: { value: this.params.maxSpeed },
      bounce: { value: this.params.bounce },
      boundsMin: { value: this.bounds.min.clone() },
      boundsMax: { value: this.bounds.max.clone() }
    };
    
    const roleUniforms = {
      deltaTime: { value: 0 },
      catchRadius: { value: this.params.catchRadius },
      predatorEnergyGain: { value: 3.0 },
      predatorEnergyDrain: { value: 0.5 },
      preyReproduceEnergy: { value: 0.3 },
      preyReproduceThreshold: { value: 4.0 },
      predatorStarveThreshold: { value: 0.5 },
      initialEnergy: { value: 5.0 },
      predatorRatio: { value: this.params.predatorRatio },
      textureSize: { value: this.textureSize },
      particleCount: { value: this.particleCount }
    };
    
    this.velocityVariable = this.gpuCompute.addVariable(
      'velocityTexture',
      velocityFragmentShader,
      velocityUniforms
    );
    
    this.positionVariable = this.gpuCompute.addVariable(
      'positionTexture',
      positionFragmentShader,
      positionUniforms
    );
    
    this.roleVariable = this.gpuCompute.addVariable(
      'roleTexture',
      roleFragmentShader,
      roleUniforms
    );
    
    this.velocityVariable.initialValue = velocityTexture;
    this.positionVariable.initialValue = positionTexture;
    this.roleVariable.initialValue = roleTexture;
    
    this.gpuCompute.setVariableDependencies(this.velocityVariable, [
      this.positionVariable,
      this.velocityVariable,
      this.roleVariable
    ]);
    
    this.gpuCompute.setVariableDependencies(this.positionVariable, [
      this.positionVariable,
      this.velocityVariable,
      this.roleVariable
    ]);
    
    this.gpuCompute.setVariableDependencies(this.roleVariable, [
      this.positionVariable,
      this.roleVariable,
      this.velocityVariable
    ]);
    
    const error = this.gpuCompute.init();
    if (error) {
      console.error('GPUComputationRenderer init error:', error);
      throw new Error(error);
    }
  }
  
  initTrailHistory() {
    const trailWidth = this.maxTrailLength;
    const trailHeight = this.particleCount;
    
    const trailData = new Float32Array(trailWidth * trailHeight * 4);
    const positions = this.positionVariable.initialValue.image.data;
    
    for (let p = 0; p < this.particleCount; p++) {
      const posIdx = p * 4;
      const x = positions[posIdx];
      const y = positions[posIdx + 1];
      const z = positions[posIdx + 2];
      
      for (let t = 0; t < this.maxTrailLength; t++) {
        const trailIdx = (t + p * trailWidth) * 4;
        trailData[trailIdx] = x;
        trailData[trailIdx + 1] = y;
        trailData[trailIdx + 2] = z;
        trailData[trailIdx + 3] = 1;
      }
    }
    
    const trailTexture = new THREE.DataTexture(
      trailData, trailWidth, trailHeight,
      THREE.RGBAFormat, THREE.FloatType
    );
    trailTexture.needsUpdate = true;
    trailTexture.minFilter = THREE.NearestFilter;
    trailTexture.magFilter = THREE.NearestFilter;
    trailTexture.wrapS = THREE.ClampToEdgeWrapping;
    trailTexture.wrapT = THREE.ClampToEdgeWrapping;
    
    this.trailHistoryRT = new THREE.WebGLRenderTarget(trailWidth, trailHeight, {
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat, type: THREE.FloatType,
      stencilBuffer: false, depthBuffer: false
    });
    
    this.trailHistoryScene = new THREE.Scene();
    this.trailHistoryCamera = new THREE.Camera();
    this.trailHistoryCamera.position.z = 1;
    
    this.trailHistoryMaterial = new THREE.ShaderMaterial({
      uniforms: {
        positionTexture: { value: null },
        trailHistoryTexture: { value: trailTexture },
        trailIndex: { value: 0 },
        maxTrailLength: { value: this.maxTrailLength },
        textureSize: { value: this.textureSize },
        resolution: { value: new THREE.Vector2(this.maxTrailLength, this.particleCount) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D positionTexture;
        uniform sampler2D trailHistoryTexture;
        uniform int trailIndex;
        uniform int maxTrailLength;
        uniform float textureSize;
        uniform vec2 resolution;
        varying vec2 vUv;
        
        void main() {
          float particleIndex = floor(vUv.y * resolution.y);
          float historySlot = floor(vUv.x * resolution.x);
          vec4 result;
          if (int(historySlot) == trailIndex) {
            vec2 particleUV = vec2(
              mod(particleIndex, textureSize) / textureSize + 0.5 / textureSize,
              floor(particleIndex / textureSize) / textureSize + 0.5 / textureSize
            );
            result = texture2D(positionTexture, particleUV);
          } else {
            float prevSlot = historySlot - 1.0;
            if (prevSlot < 0.0) prevSlot = float(maxTrailLength) - 1.0;
            vec2 prevUV = vec2(prevSlot / resolution.x, vUv.y);
            result = texture2D(trailHistoryTexture, prevUV);
          }
          gl_FragColor = result;
        }
      `
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.trailHistoryMaterial);
    this.trailHistoryScene.add(mesh);
    
    this.renderer.setRenderTarget(this.trailHistoryRT);
    this.renderer.render(this.trailHistoryScene, this.trailHistoryCamera);
    this.renderer.setRenderTarget(null);
  }
  
  initParticles() {
    const geometry = new THREE.BufferGeometry();
    const reference = new Float32Array(this.particleCount * 2);
    const trailIndex = new Float32Array(this.particleCount);
    const trailTotal = new Float32Array(this.particleCount);
    
    for (let i = 0; i < this.particleCount; i++) {
      const x = (i % this.textureSize) / this.textureSize;
      const y = Math.floor(i / this.textureSize) / this.textureSize;
      reference[i * 2] = x + (0.5 / this.textureSize);
      reference[i * 2 + 1] = y + (0.5 / this.textureSize);
      trailIndex[i] = 0;
      trailTotal[i] = this.maxTrailLength;
    }
    
    geometry.setAttribute('reference', new THREE.BufferAttribute(reference, 2));
    geometry.setAttribute('aTrailIndex', new THREE.BufferAttribute(trailIndex, 1));
    geometry.setAttribute('aTrailTotal', new THREE.BufferAttribute(trailTotal, 1));
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        size: { value: this.params.particleSize },
        scale: { value: window.innerHeight * 0.5 },
        positionTexture: { value: null },
        velocityTexture: { value: null },
        roleTexture: { value: null }
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
  }
  
  initTrailRender() {
    if (this.maxTrailLength <= 0) return;
    
    const actualTrailPoints = Math.min(this.maxTrailRenderPoints, Math.floor(this.maxTrailLength / 2));
    const totalTrailPoints = this.particleCount * actualTrailPoints;
    const step = Math.max(1, Math.floor(this.maxTrailLength / actualTrailPoints));
    
    const geometry = new THREE.BufferGeometry();
    const trailReference = new Float32Array(totalTrailPoints * 2);
    const trailOffset = new Float32Array(totalTrailPoints);
    
    let idx = 0;
    for (let i = 0; i < this.particleCount; i++) {
      const particleV = (i + 0.5) / this.particleCount;
      for (let t = 0; t < actualTrailPoints; t++) {
        trailReference[idx * 2] = 0;
        trailReference[idx * 2 + 1] = particleV;
        trailOffset[idx] = t * step;
        idx++;
      }
    }
    
    geometry.setAttribute('trailReference', new THREE.BufferAttribute(trailReference, 2));
    geometry.setAttribute('aTrailOffset', new THREE.BufferAttribute(trailOffset, 1));
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        size: { value: this.params.particleSize * 0.4 },
        scale: { value: window.innerHeight * 0.5 },
        maxTrailLength: { value: this.maxTrailLength },
        currentTrailIndex: { value: 0 },
        textureSize: { value: this.textureSize },
        trailHistoryTexture: { value: this.trailHistoryRT.texture },
        velocityTexture: { value: null },
        roleTexture: { value: null }
      },
      vertexShader: trailVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.trailParticles = new THREE.Points(geometry, material);
    this.trailParticles.frustumCulled = false;
  }
  
  initReadBuffer() {
    this.readBuffer = new Float32Array(this.textureSize * this.textureSize * 4);
  }
  
  update(deltaTime) {
    if (!this.gpuCompute || this._isDisposed) return;
    
    const dt = Math.min(deltaTime, 0.033);
    
    this.velocityVariable.material.uniforms.deltaTime.value = dt;
    this.positionVariable.material.uniforms.deltaTime.value = dt;
    this.roleVariable.material.uniforms.deltaTime.value = dt;
    
    this.gpuCompute.render();
    
    const currentPositionTarget = this.gpuCompute.getCurrentRenderTarget(this.positionVariable);
    const currentVelocityTarget = this.gpuCompute.getCurrentRenderTarget(this.velocityVariable);
    const currentRoleTarget = this.gpuCompute.getCurrentRenderTarget(this.roleVariable);
    
    this.frameCounter++;
    
    if (this.trailParticles && this.maxTrailLength > 0) {
      if (this.frameCounter % this.trailUpdateFrequency === 0) {
        this.currentTrailIndex = (this.currentTrailIndex + 1) % this.maxTrailLength;
        
        this.trailHistoryMaterial.uniforms.positionTexture.value = currentPositionTarget.texture;
        this.trailHistoryMaterial.uniforms.trailHistoryTexture.value = this.trailHistoryRT.texture;
        this.trailHistoryMaterial.uniforms.trailIndex.value = this.currentTrailIndex;
        
        const oldRT = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.trailHistoryRT);
        this.renderer.render(this.trailHistoryScene, this.trailHistoryCamera);
        this.renderer.setRenderTarget(oldRT);
      }
      
      this.trailParticles.material.uniforms.currentTrailIndex.value = this.currentTrailIndex;
      this.trailParticles.material.uniforms.trailHistoryTexture.value = this.trailHistoryRT.texture;
      this.trailParticles.material.uniforms.velocityTexture.value = currentVelocityTarget.texture;
      this.trailParticles.material.uniforms.roleTexture.value = currentRoleTarget.texture;
    }
    
    if (this.particles) {
      this.particles.material.uniforms.positionTexture.value = currentPositionTarget.texture;
      this.particles.material.uniforms.velocityTexture.value = currentVelocityTarget.texture;
      this.particles.material.uniforms.roleTexture.value = currentRoleTarget.texture;
    }
    
    if (this.frameCounter % this.populationReadInterval === 0) {
      this.updatePopulationCounts(currentRoleTarget);
    }
  }
  
  updatePopulationCounts(roleTarget) {
    if (!roleTarget || !this.readBuffer) return;
    
    this.renderer.readRenderTargetPixels(roleTarget, 0, 0, this.textureSize, this.textureSize, this.readBuffer);
    
    let predatorCount = 0;
    let preyCount = 0;
    
    for (let i = 0; i < this.particleCount; i++) {
      if (this.readBuffer[i * 4] > 0.5) {
        predatorCount++;
      } else {
        preyCount++;
      }
    }
    
    this.populationHistory.predator.push(predatorCount);
    this.populationHistory.prey.push(preyCount);
    
    if (this.populationHistory.predator.length > this.maxHistoryLength) {
      this.populationHistory.predator.shift();
      this.populationHistory.prey.shift();
    }
  }
  
  setParam(name, value) {
    this.params[name] = value;
    
    const uniformMap = {
      separation: ['velocityVariable', 'separationWeight'],
      alignment: ['velocityVariable', 'alignmentWeight'],
      cohesion: ['velocityVariable', 'cohesionWeight'],
      maxSpeed: ['velocityVariable', 'maxSpeed'],
      perceptionRadius: ['velocityVariable', 'perceptionRadius'],
      bounce: ['positionVariable', 'bounce'],
      chaseWeight: ['velocityVariable', 'chaseWeight'],
      fleeWeight: ['velocityVariable', 'fleeWeight'],
      catchRadius: ['velocityVariable', 'catchRadius']
    };
    
    if (name === 'maxSpeed' && this.positionVariable) {
      this.positionVariable.material.uniforms.maxSpeed.value = value;
    }
    
    if (uniformMap[name]) {
      const [varName, uniformName] = uniformMap[name];
      if (this[varName]) {
        this[varName].material.uniforms[uniformName].value = value;
      }
    }
    
    if (name === 'catchRadius' && this.roleVariable) {
      this.roleVariable.material.uniforms.catchRadius.value = value;
    }
    
    if (name === 'particleSize' && this.particles) {
      this.particles.material.uniforms.size.value = value;
      if (this.trailParticles) {
        this.trailParticles.material.uniforms.size.value = value * 0.5;
      }
    }
  }
  
  setTrailLength(length) {
    if (length === this.maxTrailLength) return;
    this.maxTrailLength = Math.max(0, Math.min(60, length));
    this.params.trailLength = this.maxTrailLength;
    if (this.trailParticles) {
      this.trailParticles.material.uniforms.maxTrailLength.value = this.maxTrailLength;
    }
  }
  
  reset() {
    this.dispose();
    this._isDisposed = false;
    this.populationHistory = { predator: [], prey: [] };
    this.init();
  }
  
  getParticles() { return this.particles; }
  getTrailParticles() { return this.trailParticles; }
  getParticleCount() { return this.particleCount; }
  
  getParams() {
    return { ...this.params, trailLength: this.maxTrailLength };
  }
  
  setParams(params) {
    for (const [key, value] of Object.entries(params)) {
      this.setParam(key, value);
    }
    if (params.trailLength !== undefined) {
      this.setTrailLength(params.trailLength);
    }
  }
  
  getPopulationHistory() {
    return this.populationHistory;
  }
  
  getCurrentPopulation() {
    const pred = this.populationHistory.predator;
    const prey = this.populationHistory.prey;
    return {
      predator: pred.length > 0 ? pred[pred.length - 1] : 0,
      prey: prey.length > 0 ? prey[prey.length - 1] : 0
    };
  }
  
  dispose() {
    if (this._isDisposed) return;
    this._isDisposed = true;
    
    if (this.gpuCompute) {
      this.gpuCompute.dispose();
      this.gpuCompute = null;
    }
    if (this.particles) {
      if (this.particles.geometry) this.particles.geometry.dispose();
      if (this.particles.material) this.particles.material.dispose();
      this.particles = null;
    }
    if (this.trailParticles) {
      if (this.trailParticles.geometry) this.trailParticles.geometry.dispose();
      if (this.trailParticles.material) this.trailParticles.material.dispose();
      this.trailParticles = null;
    }
    if (this.trailHistoryRT) {
      this.trailHistoryRT.dispose();
      this.trailHistoryRT = null;
    }
    if (this.trailHistoryMaterial) {
      this.trailHistoryMaterial.dispose();
      this.trailHistoryMaterial = null;
    }
    this.positionVariable = null;
    this.velocityVariable = null;
    this.roleVariable = null;
    this.trailHistoryScene = null;
    this.trailHistoryCamera = null;
    this.readBuffer = null;
  }
}

export default BoidSystem;
