import ort from 'onnxruntime-web';

const MODEL_CLASSES = {
  0: { name: 'liver_cyst', label: '肝囊肿', color: '#4ECDC4' },
  1: { name: 'kidney_stone', label: '肾结石', color: '#FF6B6B' },
  2: { name: 'tumor', label: '疑似肿瘤', color: '#FFEAA7' },
  3: { name: 'cyst', label: '囊肿', color: '#45B7D1' },
  4: { name: 'calcification', label: '钙化灶', color: '#DDA0DD' },
};

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';

class AIDetectionService {
  constructor() {
    this.session = null;
    this.isLoading = false;
    this.isReady = false;
    this.modelUrl = '/models/yolov8n-ultrasound.onnx';
    this.inputSize = 640;
    this.confidenceThreshold = 0.5;
    this.iouThreshold = 0.45;
    this.detectionInterval = 500;
    this.lastDetectionTime = 0;
    this.isRunning = false;
    this.listeners = new Map();
    this.mockMode = true;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data));
    }
  }

  async initialize() {
    await this.loadModel();
  }

  async loadModel() {
    if (this.isLoading || this.isReady) return;

    this.isLoading = true;
    this.emit('loading', true);

    try {
      try {
        this.session = await ort.InferenceSession.create(this.modelUrl, {
          executionProviders: ['webgl', 'wasm'],
        });
        this.isReady = true;
        this.mockMode = false;
        console.log('[AI] YOLOv8 model loaded successfully');
      } catch (err) {
        console.warn('[AI] Model file not found, using mock detection mode');
        this.mockMode = true;
        this.isReady = true;
      }

      this.emit('ready', { mockMode: this.mockMode });
    } catch (err) {
      console.error('[AI] Failed to load model:', err);
      this.emit('error', err);
    } finally {
      this.isLoading = false;
      this.emit('loading', false);
    }
  }

  async detect(videoElement, confidenceThreshold = 0.5) {
    if (!this.isReady) return null;

    const now = Date.now();
    if (now - this.lastDetectionTime < this.detectionInterval) {
      return null;
    }
    this.lastDetectionTime = now;
    this.confidenceThreshold = confidenceThreshold;

    if (this.mockMode) {
      return this.mockDetect(videoElement);
    }

    return this.runInference(videoElement);
  }

  async runInference(videoElement) {
    if (!this.session || !videoElement) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.inputSize;
      canvas.height = this.inputSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, this.inputSize, this.inputSize);

      const imageData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
      const input = this.preprocess(imageData);

      const feeds = { images: input };
      const results = await this.session.run(feeds);
      const output = results['output0'].data;

      const detections = this.postprocess(output, videoElement);
      return detections;
    } catch (err) {
      console.error('[AI] Inference error:', err);
      return null;
    }
  }

  preprocess(imageData) {
    const { data, width, height } = imageData;
    const float32Data = new Float32Array(3 * width * height);

    for (let i = 0; i < width * height; i++) {
      float32Data[i] = data[i * 4] / 255.0;
      float32Data[i + width * height] = data[i * 4 + 1] / 255.0;
      float32Data[i + 2 * width * height] = data[i * 4 + 2] / 255.0;
    }

    return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
  }

  postprocess(output, videoElement) {
    const detections = [];
    const numDetections = output.length / 84;

    for (let i = 0; i < numDetections; i++) {
      const offset = i * 84;
      const confidence = output[offset + 4];

      if (confidence < this.confidenceThreshold) continue;

      let classId = 0;
      let maxClassScore = 0;
      for (let j = 0; j < 80; j++) {
        const score = output[offset + 5 + j];
        if (score > maxClassScore) {
          maxClassScore = score;
          classId = j;
        }
      }

      if (maxClassScore < this.confidenceThreshold) continue;

      const cx = output[offset];
      const cy = output[offset + 1];
      const w = output[offset + 2];
      const h = output[offset + 3];

      const scaleX = videoElement.videoWidth / this.inputSize;
      const scaleY = videoElement.videoHeight / this.inputSize;

      const x = (cx - w / 2) * scaleX;
      const y = (cy - h / 2) * scaleY;
      const width = w * scaleX;
      const height = h * scaleY;

      const classInfo = MODEL_CLASSES[classId] || { name: 'unknown', label: '未知', color: '#FFFFFF' };

      detections.push({
        id: `det-${Date.now()}-${i}`,
        classId,
        className: classInfo.name,
        label: classInfo.label,
        color: classInfo.color,
        confidence: confidence * maxClassScore,
        bbox: { x, y, width, height },
        timestamp: Date.now(),
      });
    }

    return this.nonMaxSuppression(detections);
  }

  nonMaxSuppression(detections) {
    if (detections.length === 0) return [];

    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const result = [];

    while (sorted.length > 0) {
      const best = sorted.shift();
      result.push(best);

      for (let i = sorted.length - 1; i >= 0; i--) {
        const iou = this.calculateIoU(best.bbox, sorted[i].bbox);
        if (iou > this.iouThreshold) {
          sorted.splice(i, 1);
        }
      }
    }

    return result;
  }

  calculateIoU(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;

    return union > 0 ? intersection / union : 0;
  }

  mockDetect(videoElement) {
    if (!videoElement || !videoElement.videoWidth) return null;

    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;

    const mockDetections = [];

    const rand = (min, max) => Math.random() * (max - min) + min;
    const shouldDetect = Math.random() > 0.7;

    if (shouldDetect) {
      const numDetections = Math.floor(rand(1, 3));

      for (let i = 0; i < numDetections; i++) {
        const classId = Math.floor(rand(0, 5));
        const classInfo = MODEL_CLASSES[classId] || { name: 'cyst', label: '囊肿', color: '#45B7D1' };

        const bboxWidth = rand(width * 0.1, width * 0.3);
        const bboxHeight = rand(height * 0.1, height * 0.3);
        const x = rand(width * 0.1, width * 0.7);
        const y = rand(height * 0.1, height * 0.7);

        mockDetections.push({
          id: `det-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
          classId,
          className: classInfo.name,
          label: classInfo.label,
          color: classInfo.color,
          confidence: rand(0.6, 0.95),
          bbox: { x, y, width: bboxWidth, height: bboxHeight },
          timestamp: Date.now(),
        });
      }
    }

    return mockDetections.length > 0 ? mockDetections : null;
  }

  startDetectionLoop(videoElement, onDetection) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.detectCallback = onDetection;

    const loop = async () => {
      if (!this.isRunning) return;

      const detections = await this.detect(videoElement);
      if (detections && detections.length > 0) {
        this.emit('detections', detections);
        if (onDetection) {
          onDetection(detections);
        }
      }

      setTimeout(loop, this.detectionInterval);
    };

    loop();
  }

  stopDetectionLoop() {
    this.isRunning = false;
    this.detectCallback = null;
  }

  getClasses() {
    return MODEL_CLASSES;
  }

  dispose() {
    if (this.session) {
      this.session = null;
    }
    this.isReady = false;
    this.mockMode = true;
    this.stopDetectionLoop();
    this.listeners.clear();
  }

  get isMockMode() {
    return this.mockMode;
  }
}

const aiDetectionService = new AIDetectionService();
export { aiDetectionService };
export default aiDetectionService;
