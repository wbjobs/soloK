import apiClient from './ApiClient.js';

class UIController {
  constructor(boidSystem, postProcessing, cameraRecorder) {
    this.boidSystem = boidSystem;
    this.postProcessing = postProcessing;
    this.cameraRecorder = cameraRecorder;
    
    this.presets = [];
    this.cameraPaths = [];
    this.currentPresetId = null;
    this.currentPathId = null;
    
    this.dialogCallback = null;
    
    this.init();
  }
  
  init() {
    this.bindSliders();
    this.bindButtons();
    this.bindDialog();
    this.loadPresets();
    this.loadCameraPaths();
    this.updateUI();
  }
  
  bindSliders() {
    const sliderConfigs = [
      { id: 'separation', param: 'separation', target: 'boid' },
      { id: 'alignment', param: 'alignment', target: 'boid' },
      { id: 'cohesion', param: 'cohesion', target: 'boid' },
      { id: 'chase-weight', param: 'chaseWeight', target: 'boid' },
      { id: 'flee-weight', param: 'fleeWeight', target: 'boid' },
      { id: 'catch-radius', param: 'catchRadius', target: 'boid' },
      { id: 'max-speed', param: 'maxSpeed', target: 'boid' },
      { id: 'perception-radius', param: 'perceptionRadius', target: 'boid' },
      { id: 'bounce', param: 'bounce', target: 'boid' },
      { id: 'particle-size', param: 'particleSize', target: 'boid' },
      { id: 'trail-length', param: 'trailLength', target: 'boid' },
      { id: 'bloom-strength', param: 'bloomStrength', target: 'post' },
      { id: 'bloom-threshold', param: 'bloomThreshold', target: 'post' }
    ];
    
    sliderConfigs.forEach(config => {
      const slider = document.getElementById(config.id);
      const valueSpan = document.getElementById(`${config.id}-value`);
      
      if (slider && valueSpan) {
        slider.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          valueSpan.textContent = value.toFixed(config.id === 'trail-length' ? 0 : 1);
          
          if (config.target === 'boid' && this.boidSystem) {
            this.boidSystem.setParam(config.param, value);
          } else if (config.target === 'post' && this.postProcessing) {
            if (config.param === 'bloomStrength') {
              this.postProcessing.setBloomStrength(value);
            } else if (config.param === 'bloomThreshold') {
              this.postProcessing.setBloomThreshold(value);
            }
          }
        });
      }
    });
  }
  
  bindButtons() {
    const toggleBtn = document.getElementById('toggle-panel');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const panel = document.getElementById('ui-panel');
        panel.classList.toggle('collapsed');
        toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
      });
    }
    
    const savePresetBtn = document.getElementById('save-preset');
    if (savePresetBtn) {
      savePresetBtn.addEventListener('click', () => {
        this.showDialog('保存预设', (name) => {
          if (name) this.savePreset(name);
        });
      });
    }
    
    const loadPresetBtn = document.getElementById('load-preset');
    if (loadPresetBtn) {
      loadPresetBtn.addEventListener('click', () => {
        this.loadSelectedPreset();
      });
    }
    
    const deletePresetBtn = document.getElementById('delete-preset');
    if (deletePresetBtn) {
      deletePresetBtn.addEventListener('click', () => {
        this.deleteSelectedPreset();
      });
    }
    
    const startRecordingBtn = document.getElementById('start-recording');
    if (startRecordingBtn) {
      startRecordingBtn.addEventListener('click', () => {
        this.startRecording();
      });
    }
    
    const stopRecordingBtn = document.getElementById('stop-recording');
    if (stopRecordingBtn) {
      stopRecordingBtn.addEventListener('click', () => {
        this.stopRecording();
      });
    }
    
    const playPathBtn = document.getElementById('play-path');
    if (playPathBtn) {
      playPathBtn.addEventListener('click', () => {
        this.playSelectedPath();
      });
    }
    
    const stopPathBtn = document.getElementById('stop-path');
    if (stopPathBtn) {
      stopPathBtn.addEventListener('click', () => {
        this.stopPlayback();
      });
    }
    
    const deletePathBtn = document.getElementById('delete-path');
    if (deletePathBtn) {
      deletePathBtn.addEventListener('click', () => {
        this.deleteSelectedPath();
      });
    }
    
    const resetBtn = document.getElementById('reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.boidSystem) {
          this.boidSystem.reset();
        }
      });
    }
    
    const toggleBoundingBoxBtn = document.getElementById('toggle-bounding-box');
    if (toggleBoundingBoxBtn) {
      toggleBoundingBoxBtn.addEventListener('click', () => {
        this.toggleBoundingBox();
      });
    }
  }
  
  bindDialog() {
    const dialog = document.getElementById('save-dialog');
    const dialogInput = document.getElementById('dialog-input');
    const okBtn = document.getElementById('dialog-ok');
    const cancelBtn = document.getElementById('dialog-cancel');
    
    const closeDialog = () => {
      dialog.classList.add('hidden');
      dialogInput.value = '';
      this.dialogCallback = null;
    };
    
    okBtn.addEventListener('click', () => {
      const name = dialogInput.value.trim();
      if (this.dialogCallback) {
        this.dialogCallback(name);
      }
      closeDialog();
    });
    
    cancelBtn.addEventListener('click', closeDialog);
    
    dialogInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        okBtn.click();
      }
    });
    
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeDialog();
      }
    });
  }
  
  showDialog(title, callback) {
    const dialog = document.getElementById('save-dialog');
    const dialogTitle = document.getElementById('dialog-title');
    const dialogInput = document.getElementById('dialog-input');
    
    dialogTitle.textContent = title;
    dialogInput.value = '';
    dialog.classList.remove('hidden');
    dialogInput.focus();
    
    this.dialogCallback = callback;
  }
  
  async loadPresets() {
    try {
      this.presets = await apiClient.getPresets();
      this.updatePresetSelect();
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  }
  
  updatePresetSelect() {
    const select = document.getElementById('preset-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- 选择预设 --</option>';
    
    this.presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      select.appendChild(option);
    });
  }
  
  async savePreset(name) {
    if (!this.boidSystem || !this.postProcessing) return;
    
    const params = {
      boid: this.boidSystem.getParams(),
      post: this.postProcessing.getParams()
    };
    
    try {
      const saved = await apiClient.savePreset(name, params);
      this.presets.push(saved);
      this.updatePresetSelect();
      alert(`预设 "${name}" 已保存！`);
    } catch (error) {
      console.error('Failed to save preset:', error);
      alert('保存预设失败，请检查服务器是否运行。');
    }
  }
  
  async loadSelectedPreset() {
    const select = document.getElementById('preset-select');
    const presetId = select.value;
    
    if (!presetId) {
      alert('请先选择一个预设');
      return;
    }
    
    try {
      const preset = await apiClient.getPreset(presetId);
      
      if (preset.params.boid && this.boidSystem) {
        this.boidSystem.setParams(preset.params.boid);
        this.updateSliderValues(preset.params.boid, 'boid');
      }
      
      if (preset.params.post && this.postProcessing) {
        this.postProcessing.setParams(preset.params.post);
        this.updateSliderValues(preset.params.post, 'post');
      }
      
      alert(`预设 "${preset.name}" 已加载！`);
    } catch (error) {
      console.error('Failed to load preset:', error);
      alert('加载预设失败');
    }
  }
  
  async deleteSelectedPreset() {
    const select = document.getElementById('preset-select');
    const presetId = select.value;
    
    if (!presetId) {
      alert('请先选择一个预设');
      return;
    }
    
    if (!confirm('确定要删除这个预设吗？')) return;
    
    try {
      await apiClient.deletePreset(presetId);
      this.presets = this.presets.filter(p => p.id !== presetId);
      this.updatePresetSelect();
      alert('预设已删除');
    } catch (error) {
      console.error('Failed to delete preset:', error);
      alert('删除预设失败');
    }
  }
  
  async loadCameraPaths() {
    try {
      this.cameraPaths = await apiClient.getCameraPaths();
      this.updatePathSelect();
    } catch (error) {
      console.error('Failed to load camera paths:', error);
    }
  }
  
  updatePathSelect() {
    const select = document.getElementById('path-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- 选择路径 --</option>';
    
    this.cameraPaths.forEach(path => {
      const option = document.createElement('option');
      option.value = path.id;
      option.textContent = `${path.name} (${path.frames.length}帧)`;
      select.appendChild(option);
    });
  }
  
  startRecording() {
    if (!this.cameraRecorder) return;
    
    if (this.cameraRecorder.startRecording()) {
      document.getElementById('start-recording').disabled = true;
      document.getElementById('stop-recording').disabled = false;
      this.updateRecordingStatus('正在录制...');
      
      this.cameraRecorder.onRecordingStop = async (frames, duration) => {
        this.updateRecordingStatus(`录制完成: ${frames.length}帧, ${duration.toFixed(1)}秒`);
        
        setTimeout(() => {
          this.showDialog('保存相机路径', async (name) => {
            if (name) {
              try {
                const saved = await this.cameraRecorder.saveRecording(name);
                this.cameraPaths.push(saved);
                this.updatePathSelect();
                alert(`相机路径 "${name}" 已保存！`);
              } catch (error) {
                console.error('Failed to save camera path:', error);
                alert('保存相机路径失败');
              }
            }
          });
        }, 100);
      };
      
      this.cameraRecorder.onFrameRecorded = (count) => {
        this.updateRecordingStatus(`正在录制... ${count}帧`);
      };
    }
  }
  
  stopRecording() {
    if (!this.cameraRecorder) return;
    
    this.cameraRecorder.stopRecording();
    document.getElementById('start-recording').disabled = false;
    document.getElementById('stop-recording').disabled = true;
  }
  
  async playSelectedPath() {
    const select = document.getElementById('path-select');
    const pathId = select.value;
    
    if (!pathId) {
      alert('请先选择一个相机路径');
      return;
    }
    
    try {
      const pathData = await apiClient.getCameraPath(pathId);
      
      if (this.cameraRecorder && this.cameraRecorder.startPlayback(pathData)) {
        document.getElementById('play-path').disabled = true;
        document.getElementById('start-recording').disabled = true;
        
        this.cameraRecorder.onPlaybackStop = () => {
          document.getElementById('play-path').disabled = false;
          document.getElementById('start-recording').disabled = false;
          this.updateRecordingStatus('');
        };
      }
    } catch (error) {
      console.error('Failed to play camera path:', error);
      alert('播放相机路径失败');
    }
  }
  
  stopPlayback() {
    if (this.cameraRecorder) {
      this.cameraRecorder.stopPlayback();
    }
  }
  
  async deleteSelectedPath() {
    const select = document.getElementById('path-select');
    const pathId = select.value;
    
    if (!pathId) {
      alert('请先选择一个相机路径');
      return;
    }
    
    if (!confirm('确定要删除这个相机路径吗？')) return;
    
    try {
      await apiClient.deleteCameraPath(pathId);
      this.cameraPaths = this.cameraPaths.filter(p => p.id !== pathId);
      this.updatePathSelect();
      alert('相机路径已删除');
    } catch (error) {
      console.error('Failed to delete camera path:', error);
      alert('删除相机路径失败');
    }
  }
  
  updateRecordingStatus(text) {
    const statusEl = document.getElementById('recording-status');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }
  
  toggleBoundingBox() {
    const event = new CustomEvent('toggleBoundingBox');
    window.dispatchEvent(event);
  }
  
  updateSliderValues(params, type) {
    const mapping = {
      boid: {
        separation: 'separation',
        alignment: 'alignment',
        cohesion: 'cohesion',
        chaseWeight: 'chase-weight',
        fleeWeight: 'flee-weight',
        catchRadius: 'catch-radius',
        maxSpeed: 'max-speed',
        perceptionRadius: 'perception-radius',
        bounce: 'bounce',
        particleSize: 'particle-size',
        trailLength: 'trail-length'
      },
      post: {
        bloomStrength: 'bloom-strength',
        bloomThreshold: 'bloom-threshold'
      }
    };
    
    const map = mapping[type];
    if (!map) return;
    
    for (const [param, sliderId] of Object.entries(map)) {
      if (params[param] !== undefined) {
        const slider = document.getElementById(sliderId);
        const valueSpan = document.getElementById(`${sliderId}-value`);
        
        if (slider && valueSpan) {
          slider.value = params[param];
          valueSpan.textContent = params[param].toFixed(sliderId === 'trail-length' ? 0 : 1);
        }
      }
    }
  }
  
  updateUI() {
    if (this.boidSystem) {
      const count = this.boidSystem.getParticleCount();
      document.getElementById('particle-count').textContent = count;
      document.getElementById('particle-info').textContent = count;
    }
  }
  
  updateFPS(fps) {
    const fpsEl = document.getElementById('fps');
    if (fpsEl) {
      fpsEl.textContent = Math.round(fps);
    }
  }
}

export default UIController;
