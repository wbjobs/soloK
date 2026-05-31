import * as THREE from 'three';

class GPUComputationRenderer {
  constructor(sizeX, sizeY, renderer) {
    this.variables = [];
    this.currentTextureIndex = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.camera.position.z = 1;
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.renderer = renderer;

    this.passThruUniforms = {
      tDiffuse: { value: null }
    };

    this.passThruShader = this.createShaderMaterial(`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `, `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    `, this.passThruUniforms);

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.passThruShader
    );
    this.scene.add(this.mesh);
  }

  createShaderMaterial(vertexShader, fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader
    });
  }

  addVariable(name, fragmentShader, uniforms) {
    const variable = {
      name: name,
      initialValue: null,
      renderTargets: [],
      wrapS: null,
      wrapT: null,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      material: this.createShaderMaterial(`
        uniform float time;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `, fragmentShader, uniforms)
    };

    this.variables.push(variable);
    return variable;
  }

  setVariableDependencies(variable, dependencies) {
    variable.dependencies = dependencies;

    const uniforms = variable.material.uniforms;

    for (let i = 0; i < dependencies.length; i++) {
      uniforms[dependencies[i].name] = { value: null };
    }

    uniforms.resolution = { value: new THREE.Vector2(this.sizeX, this.sizeY) };
    uniforms.time = { value: 0 };
    uniforms.deltaTime = { value: 0 };
  }

  createTexture() {
    const data = new Float32Array(this.sizeX * this.sizeY * 4);
    
    const texture = new THREE.DataTexture(
      data,
      this.sizeX,
      this.sizeY,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    
    texture.needsUpdate = true;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    
    return texture;
  }

  createRenderTarget() {
    const renderTarget = new THREE.WebGLRenderTarget(this.sizeX, this.sizeY, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false
    });

    return renderTarget;
  }

  allocateTexture(texture) {
    if (texture.image === undefined) {
      texture.image = {};
    }

    texture.image.width = this.sizeX;
    texture.image.height = this.sizeY;

    return texture;
  }

  init() {
    const isWebGL2 = this.renderer.capabilities.isWebGL2;
    
    if (!isWebGL2 && !this.renderer.extensions.get('OES_texture_float')) {
      return 'No OES_texture_float support for float textures.';
    }

    if (this.renderer.capabilities.maxVertexTextures === 0) {
      return 'No support for vertex shader textures.';
    }

    for (let i = 0; i < this.variables.length; i++) {
      const variable = this.variables[i];

      variable.renderTargets[0] = this.createRenderTarget();
      variable.renderTargets[1] = this.createRenderTarget();

      if (variable.wrapS !== null) {
        variable.renderTargets[0].texture.wrapS = variable.wrapS;
        variable.renderTargets[1].texture.wrapS = variable.wrapS;
      }

      if (variable.wrapT !== null) {
        variable.renderTargets[0].texture.wrapT = variable.wrapT;
        variable.renderTargets[1].texture.wrapT = variable.wrapT;
      }

      variable.renderTargets[0].texture.minFilter = variable.minFilter;
      variable.renderTargets[1].texture.minFilter = variable.minFilter;
      variable.renderTargets[0].texture.magFilter = variable.magFilter;
      variable.renderTargets[1].texture.magFilter = variable.magFilter;

      this.renderer.setRenderTarget(variable.renderTargets[0]);
      this.renderer.clear();
      this.renderer.setRenderTarget(variable.renderTargets[1]);
      this.renderer.clear();

      this.renderTexture(variable.initialValue, variable.renderTargets[0]);
    }

    return null;
  }

  renderTexture(input, output) {
    if (input instanceof THREE.DataTexture) {
      this.allocateTexture(input);
      input.needsUpdate = true;
    }

    this.passThruUniforms.tDiffuse.value = input;
    this.mesh.material = this.passThruShader;
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  render() {
    const currentTextureIndex = this.currentTextureIndex;
    const nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;

    for (let i = 0, il = this.variables.length; i < il; i++) {
      const variable = this.variables[i];

      if (!variable.renderTargets || !variable.renderTargets[0] || !variable.renderTargets[1]) {
        console.warn('Variable render targets not initialized:', variable.name);
        continue;
      }

      if (variable.dependencies) {
        for (let j = 0; j < variable.dependencies.length; j++) {
          const depVar = variable.dependencies[j];
          if (depVar.renderTargets && depVar.renderTargets[currentTextureIndex]) {
            variable.material.uniforms[depVar.name].value =
              depVar.renderTargets[currentTextureIndex].texture;
          }
        }
      }

      if (variable.material.uniforms.time) {
        variable.material.uniforms.time.value = performance.now() / 1000;
      }

      this.mesh.material = variable.material;
      this.renderer.setRenderTarget(variable.renderTargets[nextTextureIndex]);
      this.renderer.render(this.scene, this.camera);
    }

    this.currentTextureIndex = nextTextureIndex;
  }

  getCurrentRenderTarget(variable) {
    return variable.renderTargets[this.currentTextureIndex];
  }

  getAlternateRenderTarget(variable) {
    return variable.renderTargets[this.currentTextureIndex === 0 ? 1 : 0];
  }

  dispose() {
    for (let i = 0; i < this.variables.length; i++) {
      const variable = this.variables[i];
      if (variable.renderTargets[0]) variable.renderTargets[0].dispose();
      if (variable.renderTargets[1]) variable.renderTargets[1].dispose();
      if (variable.material) variable.material.dispose();
    }

    if (this.passThruShader) this.passThruShader.dispose();
  }
}

export default GPUComputationRenderer;
