import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    this.params = {
      bloomStrength: 1.5,
      bloomRadius: 0.5,
      bloomThreshold: 0.4
    };
    
    this.composer = null;
    this.bloomPass = null;
    this.fxaaPass = null;
    
    this.init();
  }
  
  init() {
    const renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType
      }
    );
    
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.params.bloomStrength,
      this.params.bloomRadius,
      this.params.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);
    
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.material.uniforms['resolution'].value.set(
      1 / window.innerWidth,
      1 / window.innerHeight
    );
    this.composer.addPass(this.fxaaPass);
  }
  
  render(deltaTime) {
    if (this.composer) {
      this.composer.render(deltaTime);
    }
  }
  
  setBloomStrength(value) {
    this.params.bloomStrength = value;
    if (this.bloomPass) {
      this.bloomPass.strength = value;
    }
  }
  
  setBloomRadius(value) {
    this.params.bloomRadius = value;
    if (this.bloomPass) {
      this.bloomPass.radius = value;
    }
  }
  
  setBloomThreshold(value) {
    this.params.bloomThreshold = value;
    if (this.bloomPass) {
      this.bloomPass.threshold = value;
    }
  }
  
  getParams() {
    return { ...this.params };
  }
  
  setParams(params) {
    if (params.bloomStrength !== undefined) {
      this.setBloomStrength(params.bloomStrength);
    }
    if (params.bloomRadius !== undefined) {
      this.setBloomRadius(params.bloomRadius);
    }
    if (params.bloomThreshold !== undefined) {
      this.setBloomThreshold(params.bloomThreshold);
    }
  }
  
  resize(width, height) {
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.fxaaPass) {
      this.fxaaPass.material.uniforms['resolution'].value.set(1 / width, 1 / height);
    }
  }
  
  dispose() {
    if (this.composer) {
      this.composer.dispose();
    }
  }
}

export default PostProcessing;
