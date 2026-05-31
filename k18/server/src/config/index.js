const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3001,
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || null,
  },
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'ultrasound-recordings',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'ultrasound-consultation-secret-key-2024',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  recording: {
    dir: process.env.RECORDING_DIR || './recordings',
  },
  maxExperts: parseInt(process.env.MAX_EXPERTS, 10) || 5,
  videoBitrate: {
    base: parseInt(process.env.VIDEO_BITRATE_BASE, 10) || 2500000,
    min: parseInt(process.env.VIDEO_BITRATE_MIN, 10) || 500000,
    max: parseInt(process.env.VIDEO_BITRATE_MAX, 10) || 5000000,
  },
};
