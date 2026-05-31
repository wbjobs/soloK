class RecordingService {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.listeners = new Map();
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

  async startRecording(stream, mimeType = 'video/webm;codecs=vp9') {
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn('[Recording] MIME type not supported, trying default');
    }

    try {
      this.stream = stream;
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          this.emit('data', event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        this.emit('stopped', { blob, chunks: this.recordedChunks });
        this.isRecording = false;
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('[Recording] Error:', event.error);
        this.emit('error', event.error);
      };

      this.mediaRecorder.start(1000);
      this.isRecording = true;
      this.emit('started', { startTime: Date.now() });

      return true;
    } catch (err) {
      console.error('[Recording] Failed to start:', err);
      throw err;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  getBlob() {
    return new Blob(this.recordedChunks, { type: 'video/webm' });
  }

  getObjectURL() {
    const blob = this.getBlob();
    return URL.createObjectURL(blob);
  }

  download(filename = 'recording.webm') {
    const url = this.getObjectURL();
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async uploadToServer(roomId, fileName) {
    const blob = this.getBlob();
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('roomId', roomId);

    const response = await fetch('/api/recordings/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return response.json();
  }
}

const recordingService = new RecordingService();
export default recordingService;
