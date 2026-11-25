'use strict';

const env = require('../config/env');
const { redis } = require('../db/redis');
const { logAudit } = require('../services/audit.service');

// Atomic increment + TTL set using Redis 2.0+ commands only (Redis 5 compatible)
const INCREMENT_LOGIN_FAILURE_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

function buildLoginRateLimitKey(ip, userNm) {
  const safeIp = ip || 'unknown';
  const normalizedUser = String(userNm || '').trim().toLowerCase();
  return `ratelimit:login:${safeIp}:${normalizedUser}`;
}

async function incrementLoginFailure(ip, userNm) {
  const key = buildLoginRateLimitKey(ip, userNm);
  const [count, ttl] = await redis.eval(
    INCREMENT_LOGIN_FAILURE_LUA,
    1,
    key,
    env.LOGIN_WINDOW_SEC
  );
  return {
    count: Number(count) || 0,
    retryAfterSec: Number(ttl) > 0 ? Number(ttl) : env.LOGIN_WINDOW_SEC,
  };
}

async function resetLoginFailures(ip, userNm) {
  const key = buildLoginRateLimitKey(ip, userNm);
  await redis.del(key);
}

async function loginRateLimit(req, res, next) {
  try {
    const userNm = req.body && typeof req.body.user_nm === 'string' ? req.body.user_nm : '';
    const key = buildLoginRateLimitKey(req.ip, userNm);

    const results = await redis.multi().get(key).ttl(key).exec();
    const [getErr, rawCount] = results[0];
    const [ttlErr, rawTtl] = results[1];

    if (getErr) throw getErr;
    if (ttlErr) throw ttlErr;

    const attempts = Number(rawCount) || 0;
    if (attempts >= env.LOGIN_MAX_ATTEMPTS) {
      const retryAfterSec = Number(rawTtl) > 0 ? Number(rawTtl) : env.LOGIN_WINDOW_SEC;

      logAudit({
        endpoint: req.baseUrl + req.path,
        method: req.method,
        action: 'login_rate_limited',
        ip: req.ip,
        user_agent: req.get('user-agent') || null,
        status: 'blocked',
        reason: 'rate_limit_exceeded',
      });

      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        message: 'Terlalu banyak percobaan login gagal. Silakan coba lagi nanti.',
        retry_after_sec: retryAfterSec,
      });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  loginRateLimit,
  buildLoginRateLimitKey,
  incrementLoginFailure,
  resetLoginFailures,
};

