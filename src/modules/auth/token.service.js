'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../shared/config/env');
const { redis } = require('../../shared/db/redis');
const { sha256 } = require('../../shared/utils/crypto');

const REFRESH_COOKIE_NAME = 'refresh_token';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_HEX_REGEX = /^[0-9a-f]{64}$/i;

// Atomic refresh token rotation using Redis 2.6.12+ commands only (Redis 5 compatible)
// Preserves absolute shift expiration (exp_unix is never extended).
// Deletes session immediately if presented secret hash does not match (reuse detection).
const ROTATE_REFRESH_SESSION_LUA = `
local val = redis.call('GET', KEYS[1])
if not val then
  return {'MISSING', 0}
end
local sep = string.find(val, '|', 1, true)
if not sep then
  redis.call('DEL', KEYS[1])
  return {'INVALID', 0}
end
local storedHash = string.sub(val, 1, sep - 1)
local expUnix = tonumber(string.sub(val, sep + 1))
local nowUnix = tonumber(ARGV[3])
if not expUnix or expUnix <= nowUnix then
  redis.call('DEL', KEYS[1])
  return {'EXPIRED', 0}
end
if storedHash ~= ARGV[1] then
  redis.call('DEL', KEYS[1])
  return {'MISMATCH', 0}
end
local remainingTtl = expUnix - nowUnix
if remainingTtl <= 0 then
  redis.call('DEL', KEYS[1])
  return {'EXPIRED', 0}
end
redis.call('SET', KEYS[1], ARGV[2] .. '|' .. tostring(expUnix), 'EX', remainingTtl)
return {'OK', remainingTtl}
`;

function buildRefreshKey(userId, sessionId) {
  return `refresh:${userId}:${sessionId}`;
}

function buildBlacklistKey(jti) {
  return `blacklist:${jti}`;
}

function formatRefreshToken(userId, sessionId, secret) {
  return `${userId}.${sessionId}.${secret}`;
}

function parseRefreshToken(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    return null;
  }

  const parts = rawToken.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [userIdStr, sessionId, secret] = parts;
  if (!/^\d+$/.test(userIdStr)) {
    return null;
  }

  const userId = Number(userIdStr);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }

  if (!UUID_REGEX.test(sessionId) || !SECRET_HEX_REGEX.test(secret)) {
    return null;
  }

  return { userId, sessionId, secret };
}

function signAccessToken(user, sessionId) {
  const payload = {
    user_id: user.user_id,
    person_id: user.person_id,
    org_id: user.org_id ?? null,
    profession_id: user.profession_id ?? null,
    profession_type: user.profession_type,
    pgroup_id: user.pgroup_id,
    sid: sessionId,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    jwtid: crypto.randomUUID(),
    issuer: env.JWT_ISSUER,
  });
}

async function createRefreshSession(userId) {
  const sessionId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('hex');
  const nowUnix = Math.floor(Date.now() / 1000);
  const expUnix = nowUnix + env.REFRESH_TOKEN_TTL_SEC;

  const key = buildRefreshKey(userId, sessionId);
  const value = `${sha256(secret)}|${expUnix}`;

  await redis.set(key, value, 'EX', env.REFRESH_TOKEN_TTL_SEC);

  return {
    sessionId,
    refreshToken: formatRefreshToken(userId, sessionId, secret),
    remainingTtlSec: env.REFRESH_TOKEN_TTL_SEC,
  };
}

async function rotateRefreshSession(userId, sessionId, presentedSecret) {
  const newSecret = crypto.randomBytes(32).toString('hex');
  const presentedHash = sha256(presentedSecret);
  const newHash = sha256(newSecret);
  const nowUnix = Math.floor(Date.now() / 1000);

  const key = buildRefreshKey(userId, sessionId);
  const [status, remainingTtl] = await redis.eval(
    ROTATE_REFRESH_SESSION_LUA,
    1,
    key,
    presentedHash,
    newHash,
    nowUnix
  );

  const remainingTtlSec = Number(remainingTtl) || 0;

  return {
    status,
    remainingTtlSec,
    refreshToken:
      status === 'OK' ? formatRefreshToken(userId, sessionId, newSecret) : null,
  };
}

async function deleteRefreshSession(userId, sessionId) {
  const key = buildRefreshKey(userId, sessionId);
  await redis.del(key);
}

async function blacklistAccessToken(jti, expUnix) {
  if (!jti || !expUnix) {
    return;
  }
  const nowUnix = Math.floor(Date.now() / 1000);
  const remainingTtl = Number(expUnix) - nowUnix;
  if (remainingTtl > 0) {
    await redis.set(buildBlacklistKey(jti), '1', 'EX', remainingTtl);
  }
}

function getRefreshCookieOptions(remainingTtlSec) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/auth',
    secure: env.COOKIE_SECURE,
    maxAge: Math.max(0, Number(remainingTtlSec) || 0) * 1000,
  };
}

function getClearRefreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/auth',
    secure: env.COOKIE_SECURE,
  };
}

module.exports = {
  REFRESH_COOKIE_NAME,
  parseRefreshToken,
  signAccessToken,
  createRefreshSession,
  rotateRefreshSession,
  deleteRefreshSession,
  blacklistAccessToken,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions,
};

