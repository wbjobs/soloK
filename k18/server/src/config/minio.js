const Minio = require('minio');
const config = require('../config');
const { minio: minioConfig } = config;

const minioClient = new Minio.Client({
  endPoint: minioConfig.endPoint,
  port: minioConfig.port,
  accessKey: minioConfig.accessKey,
  secretKey: minioConfig.secretKey,
  useSSL: false,
});

async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(minioConfig.bucket);
    if (!exists) {
      await minioClient.makeBucket(minioConfig.bucket, 'us-east-1');
      console.log(`[MinIO] Bucket '${minioConfig.bucket}' created successfully`);
    } else {
      console.log(`[MinIO] Bucket '${minioConfig.bucket}' already exists`);
    }
  } catch (err) {
    console.error('[MinIO] Bucket initialization error:', err.message);
  }
}

async function uploadFile(fileName, filePath, metaData = {}) {
  const result = await minioClient.fPutObject(
    minioConfig.bucket,
    fileName,
    filePath,
    metaData
  );
  return result;
}

async function uploadBuffer(fileName, buffer, metaData = {}) {
  const result = await minioClient.putObject(
    minioConfig.bucket,
    fileName,
    buffer,
    buffer.length,
    metaData
  );
  return result;
}

async function getPresignedUrl(fileName, expiry = 604800) {
  const url = await minioClient.presignedGetObject(
    minioConfig.bucket,
    fileName,
    expiry
  );
  return url;
}

async function getObject(fileName) {
  const dataStream = await minioClient.getObject(minioConfig.bucket, fileName);
  const chunks = [];
  for await (const chunk of dataStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function removeObject(fileName) {
  await minioClient.removeObject(minioConfig.bucket, fileName);
}

async function listObjects(prefix = '') {
  const objects = [];
  const stream = minioClient.listObjectsV2(minioConfig.bucket, prefix, true);
  for await (const obj of stream) {
    objects.push(obj);
  }
  return objects;
}

module.exports = {
  minioClient,
  ensureBucket,
  uploadFile,
  uploadBuffer,
  getPresignedUrl,
  getObject,
  removeObject,
  listObjects,
};
