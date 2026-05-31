import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import apiClient from './ApiClient.js';

class CameraRecorder {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    
    this.isRecording = false;
    this.isPlaying = false;
    this.recordedFrames = [];
    this.currentFrame = 0;
    this.playbackTween = null;
    this.playbackData = null;
    
    this.onRecordingStart = null;
    this.onRecordingStop = null;
    this.onPlaybackStart = null;
    this.onPlaybackStop = null;
    this.onFrameRecorded = null;
  }
  
  startRecording() {
    if (this.isRecording || this.isPlaying) return false;
    
    this.isRecording = true;
    this.recordedFrames = [];
    this.currentFrame = 0;
    
    if (this.onRecordingStart) {
      this.onRecordingStart();
    }
    
    return true;
  }
  
  stopRecording() {
    if (!this.isRecording) return null;
    
    this.isRecording = false;
    
    const frames = [...this.recordedFrames];
    const duration = frames.length / 60;
    
    if (this.onRecordingStop) {
      this.onRecordingStop(frames, duration);
    }
    
    return { frames, duration };
  }
  
  recordFrame() {
    if (!this.isRecording) return;
    
    const frame = {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      },
      target: {
        x: this.controls.target.x,
        y: this.controls.target.y,
        z: this.controls.target.z
      },
      time: performance.now()
    };
    
    this.recordedFrames.push(frame);
    this.currentFrame++;
    
    if (this.onFrameRecorded) {
      this.onFrameRecorded(this.currentFrame);
    }
  }
  
  async saveRecording(name) {
    if (this.recordedFrames.length === 0) {
      throw new Error('No frames recorded');
    }
    
    const duration = this.recordedFrames.length / 60;
    const result = await apiClient.saveCameraPath(name, this.recordedFrames, duration);
    return result;
  }
  
  startPlayback(pathData) {
    if (this.isPlaying || this.isRecording || !pathData || !pathData.frames || pathData.frames.length === 0) {
      return false;
    }
    
    this.isPlaying = true;
    this.playbackData = pathData;
    this.currentFrame = 0;
    
    if (this.controls) {
      this.controls.enabled = false;
    }
    
    if (this.onPlaybackStart) {
      this.onPlaybackStart();
    }
    
    this.playbackTween = new TWEEN.Tween({ frame: 0 })
      .to({ frame: pathData.frames.length - 1 }, pathData.duration * 1000)
      .easing(TWEEN.Easing.Linear.None)
      .onUpdate((obj) => {
        const frameIndex = Math.floor(obj.frame);
        const nextFrameIndex = Math.min(frameIndex + 1, pathData.frames.length - 1);
        const t = obj.frame - frameIndex;
        
        const frame = pathData.frames[frameIndex];
        const nextFrame = pathData.frames[nextFrameIndex];
        
        this.camera.position.x = this.lerp(frame.position.x, nextFrame.position.x, t);
        this.camera.position.y = this.lerp(frame.position.y, nextFrame.position.y, t);
        this.camera.position.z = this.lerp(frame.position.z, nextFrame.position.z, t);
        
        this.controls.target.x = this.lerp(frame.target.x, nextFrame.target.x, t);
        this.controls.target.y = this.lerp(frame.target.y, nextFrame.target.y, t);
        this.controls.target.z = this.lerp(frame.target.z, nextFrame.target.z, t);
        
        this.controls.update();
      })
      .onComplete(() => {
        this.stopPlayback();
      })
      .start();
    
    return true;
  }
  
  stopPlayback() {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    
    if (this.playbackTween) {
      TWEEN.remove(this.playbackTween);
      this.playbackTween = null;
    }
    
    if (this.controls) {
      this.controls.enabled = true;
    }
    
    if (this.onPlaybackStop) {
      this.onPlaybackStop();
    }
  }
  
  lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  update(deltaTime) {
    if (this.isRecording) {
      this.recordFrame();
    }
    
    if (this.isPlaying && this.playbackTween) {
      TWEEN.update();
    }
  }
  
  getFrameCount() {
    return this.recordedFrames.length;
  }
  
  dispose() {
    this.stopRecording();
    this.stopPlayback();
  }
}

export default CameraRecorder;
