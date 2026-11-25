'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { redis } = require('../db/redis');
const AppError = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return next(new AppError(401, 'Token autentikasi tidak ditemukan'));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next(new AppError(401, 'Token autentikasi tidak valid'));
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
      });
    } catch {
      return next(new AppError(401, 'Token tidak valid atau sudah kedaluwarsa'));
    }

    if (!payload || !payload.jti || !payload.user_id || !payload.sid) {
      return next(new AppError(401, 'Token tidak valid'));
    }

    const blacklisted = await redis.get(`blacklist:${payload.jti}`);
    if (blacklisted !== null) {
      return next(new AppError(401, 'Token telah dicabut'));
    }

    req.user = {
      user_id: payload.user_id,
      person_id: payload.person_id,
      org_id: payload.org_id ?? null,
      profession_id: payload.profession_id ?? null,
      profession_type: payload.profession_type ?? null,
      pgroup_id: payload.pgroup_id,
      sid: payload.sid,
    };

    req.tokenMeta = {
      jti: payload.jti,
      exp: payload.exp,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;

