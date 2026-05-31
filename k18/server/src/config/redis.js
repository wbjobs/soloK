const Redis = require('ioredis');
const config = require('../config');

const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

if (config.redis.password) {
  redisConfig.password = config.redis.password;
}

const redis = new Redis(redisConfig);
const redisPubSub = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redisPubSub.on('connect', () => {
  console.log('[Redis PubSub] Connected successfully');
});

redisPubSub.on('error', (err) => {
  console.error('[Redis PubSub] Connection error:', err.message);
});

module.exports = { redis, redisPubSub };
