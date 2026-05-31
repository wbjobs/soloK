const { v4: uuidv4 } = require('uuid');
const { redis } = require('../config/redis');
const { uploadBuffer, getPresignedUrl, listObjects, getObject } = require('../config/minio');

class PacsService {
  constructor() {
    this.keyframes = new Map();
  }

  async saveKeyframe(roomId, expertId, expertName, frameData, diagnosis, report) {
    const keyframeId = uuidv4();
    const timestamp = Date.now();
    const fileName = `keyframes/${roomId}-${keyframeId}.png`;

    const imageBuffer = Buffer.from(frameData.split(',')[1], 'base64');

    try {
      await uploadBuffer(fileName, imageBuffer, {
        'Content-Type': 'image/png',
        'room-id': roomId,
        'expert-id': expertId,
        'expert-name': expertName,
        'diagnosis': diagnosis || '',
        'timestamp': timestamp.toString(),
      });
    } catch (err) {
      console.error('[PACS] MinIO upload error:', err);
      throw err;
    }

    const keyframe = {
      id: keyframeId,
      roomId,
      expertId,
      expertName,
      diagnosis: diagnosis || '',
      report: report || {},
      fileName,
      timestamp,
    };

    this.keyframes.set(keyframeId, keyframe);

    await redis.set(
      `keyframe:${keyframeId}`,
      JSON.stringify(keyframe),
      'EX', 604800
    );

    await redis.lpush(
      `room:${roomId}:keyframes`,
      JSON.stringify(keyframe)
    );

    return keyframe;
  }

  async getKeyframe(keyframeId) {
    try {
      const cached = await redis.get(`keyframe:${keyframeId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.error('[PACS] Redis error:', err);
    }

    return this.keyframes.get(keyframeId) || null;
  }

  async getKeyframeUrl(keyframeId) {
    const keyframe = await this.getKeyframe(keyframeId);
    if (!keyframe) return null;

    try {
      const url = await getPresignedUrl(keyframe.fileName);
      return { ...keyframe, imageUrl: url };
    } catch (err) {
      console.error('[PACS] URL error:', err);
      return null;
    }
  }

  async getRoomKeyframes(roomId) {
    try {
      const cachedList = await redis.lrange(`room:${roomId}:keyframes`, 0, -1);
      return cachedList.map((item) => JSON.parse(item));
    } catch (err) {
      console.error('[PACS] Redis error:', err);
      return [];
    }
  }

  async getRoomKeyframeUrls(roomId) {
    const keyframes = await this.getRoomKeyframes(roomId);
    const results = [];

    for (const kf of keyframes) {
      try {
        const url = await getPresignedUrl(kf.fileName);
        results.push({ ...kf, imageUrl: url });
      } catch (err) {
        results.push({ ...kf, imageUrl: null });
      }
    }

    return results;
  }

  async updateReport(keyframeId, diagnosis, report) {
    const keyframe = await this.getKeyframe(keyframeId);
    if (!keyframe) return null;

    keyframe.diagnosis = diagnosis || keyframe.diagnosis;
    keyframe.report = report || keyframe.report;
    keyframe.updatedAt = Date.now();

    await redis.set(
      `keyframe:${keyframeId}`,
      JSON.stringify(keyframe),
      'EX', 604800
    );

    this.keyframes.set(keyframeId, keyframe);

    return keyframe;
  }

  async listAllKeyframes() {
    try {
      const objects = await listObjects('keyframes/');
      return objects.map((obj) => ({
        name: obj.name,
        size: obj.size,
        lastModified: obj.lastModified,
      }));
    } catch (err) {
      console.error('[PACS] List error:', err);
      return [];
    }
  }
}

const pacsService = new PacsService();
module.exports = pacsService;
