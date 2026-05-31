const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { redis } = require('../config/redis');
const { uploadFile, getPresignedUrl, listObjects } = require('../config/minio');
const config = require('../config');

class RecordingService {
  constructor() {
    this.recordingDir = config.recording.dir;
    if (!fs.existsSync(this.recordingDir)) {
      fs.mkdirSync(this.recordingDir, { recursive: true });
    }
    this.activeRecordings = new Map();
  }

  async startRecording(roomId, metadata = {}) {
    const recordingId = uuidv4();
    const timestamp = Date.now();
    const fileName = `recording-${roomId}-${timestamp}.webm`;
    const filePath = path.join(this.recordingDir, fileName);

    const recording = {
      id: recordingId,
      roomId,
      fileName,
      filePath,
      startedAt: timestamp,
      stoppedAt: null,
      metadata,
      events: [],
      annotations: [],
      measurements: [],
      keyframes: [],
      status: 'recording',
    };

    this.activeRecordings.set(roomId, recording);

    await redis.set(`recording:${roomId}`, JSON.stringify({
      id: recordingId,
      startedAt: timestamp,
      status: 'recording',
    }), 'EX', 86400);

    return recording;
  }

  async stopRecording(roomId) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return null;

    recording.stoppedAt = Date.now();
    recording.status = 'stopped';
    recording.duration = recording.stoppedAt - recording.startedAt;

    await redis.del(`recording:${roomId}`);

    const sessionData = {
      id: recording.id,
      roomId,
      startedAt: recording.startedAt,
      stoppedAt: recording.stoppedAt,
      duration: recording.duration,
      events: recording.events,
      annotations: recording.annotations,
      measurements: recording.measurements,
      keyframes: recording.keyframes,
      metadata: recording.metadata,
    };

    const sessionFileName = `session-${roomId}-${recording.startedAt}.json`;
    const sessionPath = path.join(this.recordingDir, sessionFileName);
    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

    this.activeRecordings.delete(roomId);

    return recording;
  }

  addEvent(roomId, event) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return;
    const relativeTime = Date.now() - recording.startedAt;
    recording.events.push({
      ...event,
      timestamp: Date.now(),
      relativeTime,
    });
  }

  addAnnotation(roomId, annotation) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return;
    const relativeTime = Date.now() - recording.startedAt;
    recording.annotations.push({
      ...annotation,
      timestamp: annotation.timestamp || Date.now(),
      relativeTime,
      action: 'add',
    });
  }

  addAnnotationUpdate(roomId, annotationId, updates) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return;
    const relativeTime = Date.now() - recording.startedAt;
    recording.annotations.push({
      id: annotationId,
      ...updates,
      timestamp: Date.now(),
      relativeTime,
      action: 'update',
    });
  }

  addAnnotationRemove(roomId, annotationId) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return;
    const relativeTime = Date.now() - recording.startedAt;
    recording.annotations.push({
      id: annotationId,
      timestamp: Date.now(),
      relativeTime,
      action: 'remove',
    });
  }

  addMeasurement(roomId, measurement) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return;
    const relativeTime = Date.now() - recording.startedAt;
    recording.measurements.push({
      ...measurement,
      timestamp: measurement.timestamp || Date.now(),
      relativeTime,
      action: 'add',
    });
  }

  addMeasurementRemove(roomId, measurementId) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return;
    const relativeTime = Date.now() - recording.startedAt;
    recording.measurements.push({
      id: measurementId,
      timestamp: Date.now(),
      relativeTime,
      action: 'remove',
    });
  }

  addKeyframe(roomId, keyframe) {
    const recording = this.activeRecordings.get(roomId);
    if (!recording) return;
    const relativeTime = Date.now() - recording.startedAt;
    recording.keyframes.push({
      ...keyframe,
      timestamp: keyframe.timestamp || Date.now(),
      relativeTime,
    });
  }

  async saveToMinio(recording) {
    try {
      const result = await uploadFile(
        `recordings/${recording.fileName}`,
        recording.filePath,
        {
          'Content-Type': 'video/webm',
          'room-id': recording.roomId,
          'started-at': recording.startedAt.toString(),
          'duration': (recording.duration || 0).toString(),
        }
      );

      const presignedUrl = await getPresignedUrl(
        `recordings/${recording.fileName}`
      );

      return {
        etag: result.etag,
        presignedUrl,
      };
    } catch (err) {
      console.error('[Recording] MinIO upload error:', err);
      throw err;
    }
  }

  async getRecordingList(roomId = null) {
    try {
      const prefix = roomId ? `recordings/recording-${roomId}-` : 'recordings/';
      const objects = await listObjects(prefix);
      return objects.map((obj) => ({
        name: obj.name,
        size: obj.size,
        lastModified: obj.lastModified,
        etag: obj.etag,
      }));
    } catch (err) {
      console.error('[Recording] List error:', err);
      return [];
    }
  }

  async getRecordingUrl(fileName) {
    try {
      const url = await getPresignedUrl(`recordings/${fileName}`);
      return url;
    } catch (err) {
      console.error('[Recording] URL error:', err);
      return null;
    }
  }
}

const recordingService = new RecordingService();
module.exports = recordingService;
