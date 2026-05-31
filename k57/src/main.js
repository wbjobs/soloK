import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import BoidSystem from './js/BoidSystem.js';
import PostProcessing from './js/PostProcessing.js';
import CameraRecorder from './js/CameraRecorder.js';
import UIController from './js/UIController.js';
import PopulationChart from './js/PopulationChart.js';
import apiClient from './js/ApiClient.js';

class App {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    
    this.boidSystem = null;
    this.postProcessing = null;
    this.cameraRecorder = null;
    this.uiController = null;
    this.populationChart = null;
    
    this.boundingBox = null;
    this.boundingBoxVisible = false;
    
    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 0;
    
    this.bounds = {
      min: new THREE.Vector3(-15, -15, -15),
      max: new THREE.Vector3(15, 15, 15)
    };
    
    this.particleCount = 5000;
    
    this.init();
    this.animate();
    
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('toggleBoundingBox', () => this.toggleBoundingBox());
    
    apiClient.checkHealth().then((healthy) => {
      if (!healthy) {
        console.warn('Backend server is not running. Preset and camera path features will be disabled.');
      }
    });
  }
  
  init() {
    this.canvas = document.getElementById('canvas');
    
    const canvas = this.canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      powerPreference: 'high-performance'
    });
    
    if (!gl) {
      alert('WebGL 2.0 is not supported in this browser.');
      throw new Error('WebGL 2.0 not supported');
    }
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      context: gl,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x050510, 1);
    this.renderer.autoClear = false;
    
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050510, 0.02);
    
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(25, 15, 25);
    
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 80;
    this.controls.target.set(0, 0, 0);
    
    this.createAmbientLight();
    this.createBoundingBox();
    this.createBoidSystem();
    this.createPostProcessing();
    this.createCameraRecorder();
    this.createUIController();
    this.createPopulationChart();
  }
  
  createAmbientLight() {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambientLight);
    
    const pointLight1 = new THREE.PointLight(0x4488ff, 1, 100);
    pointLight1.position.set(20, 20, 20);
    this.scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0xff4488, 0.8, 100);
    pointLight2.position.set(-20, -10, -20);
    this.scene.add(pointLight2);
  }
  
  createBoundingBox() {
    const geometry = new THREE.BoxGeometry(
      this.bounds.max.x - this.bounds.min.x,
      this.bounds.max.y - this.bounds.min.y,
      this.bounds.max.z - this.bounds.min.z
    );
    
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.3
    });
    
    this.boundingBox = new THREE.LineSegments(edges, material);
    this.boundingBox.position.set(
      (this.bounds.max.x + this.bounds.min.x) / 2,
      (this.bounds.max.y + this.bounds.min.y) / 2,
      (this.bounds.max.z + this.bounds.min.z) / 2
    );
    this.boundingBox.visible = this.boundingBoxVisible;
    this.scene.add(this.boundingBox);
  }
  
  createBoidSystem() {
    this.boidSystem = new BoidSystem(this.renderer, {
      particleCount: this.particleCount,
      bounds: this.bounds,
      separation: 1.5,
      alignment: 1.0,
      cohesion: 1.0,
      maxSpeed: 0.8,
      perceptionRadius: 2.5,
      bounce: 1.0,
      particleSize: 3.0,
      trailLength: 20,
      chaseWeight: 2.0,
      fleeWeight: 3.0,
      catchRadius: 0.5,
      predatorRatio: 0.15
    });
    
    const trailParticles = this.boidSystem.getTrailParticles();
    if (trailParticles) {
      this.scene.add(trailParticles);
    }
    
    const particles = this.boidSystem.getParticles();
    if (particles) {
      this.scene.add(particles);
    }
  }
  
  createPostProcessing() {
    this.postProcessing = new PostProcessing(
      this.renderer,
      this.scene,
      this.camera
    );
  }
  
  createCameraRecorder() {
    this.cameraRecorder = new CameraRecorder(this.camera, this.controls);
  }
  
  createUIController() {
    this.uiController = new UIController(
      this.boidSystem,
      this.postProcessing,
      this.cameraRecorder
    );
  }
  
  createPopulationChart() {
    this.populationChart = new PopulationChart('population-chart');
  }
  
  toggleBoundingBox() {
    this.boundingBoxVisible = !this.boundingBoxVisible;
    if (this.boundingBox) {
      this.boundingBox.visible = this.boundingBoxVisible;
    }
  }
  
  updateFPS() {
    this.frameCount++;
    const now = performance.now();
    
    if (now - this.lastTime >= 1000) {
      this.fps = (this.frameCount * 1000) / (now - this.lastTime);
      this.frameCount = 0;
      this.lastTime = now;
      
      if (this.uiController) {
        this.uiController.updateFPS(this.fps);
      }
    }
  }
  
  updatePopulationDisplay() {
    if (!this.boidSystem) return;
    
    const pop = this.boidSystem.getCurrentPopulation();
    
    const predEl = document.getElementById('predator-count');
    const preyEl = document.getElementById('prey-count');
    
    if (predEl) predEl.textContent = pop.predator;
    if (preyEl) preyEl.textContent = pop.prey;
    
    if (this.populationChart && this.boidSystem.populationHistory.predator.length > 1) {
      this.populationChart.draw(
        this.boidSystem.getPopulationHistory(),
        this.particleCount
      );
    }
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    const deltaTime = this.clock.getDelta();
    
    this.controls.update();
    
    if (this.boidSystem) {
      this.boidSystem.update(deltaTime);
    }
    
    if (this.cameraRecorder) {
      this.cameraRecorder.update(deltaTime);
    }
    
    if (this.postProcessing) {
      this.postProcessing.render(deltaTime);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    
    this.updateFPS();
    this.updatePopulationDisplay();
  }
  
  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
    
    if (this.postProcessing) {
      this.postProcessing.resize(width, height);
    }
    
    if (this.boidSystem) {
      const particles = this.boidSystem.getParticles();
      if (particles) {
        particles.material.uniforms.scale.value = height * 0.5;
      }
      
      const trailParticles = this.boidSystem.getTrailParticles();
      if (trailParticles) {
        trailParticles.material.uniforms.scale.value = height * 0.5;
      }
    }
  }
  
  dispose() {
    if (this.boidSystem) {
      this.boidSystem.dispose();
    }
    
    if (this.postProcessing) {
      this.postProcessing.dispose();
    }
    
    if (this.cameraRecorder) {
      this.cameraRecorder.dispose();
    }
    
    if (this.controls) {
      this.controls.dispose();
    }
    
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
