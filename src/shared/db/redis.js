'use strict';

const Redis = require('ioredis');
const env = require('../config/env');

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  keyPrefix: env.REDIS_KEY_PREFIX,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  console.error('[REDIS_ERROR]', err.message);
});

async function connectRedis() {
  if (redis.status === 'wait') {
    await redis.connect();
  }
  await redis.ping();
}

async function closeRedis() {
  if (redis.status !== 'end' && redis.status !== 'wait') {
    await redis.quit();
  }
}

module.exports = {
  redis,
  connectRedis,
  closeRedis,
};

