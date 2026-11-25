'use strict';

const env = require('../../shared/config/env');
const { pool } = require('../../shared/db/mysql');
const { md5, timingSafeEqualStr } = require('../../shared/utils/crypto');
const AppError = require('../../shared/utils/AppError');
const { logAudit } = require('../../shared/services/audit.service');
const {
  incrementLoginFailure,
  resetLoginFailures,
} = require('../../shared/middlewares/loginRateLimit');
const tokenService = require('./token.service');

const GENERIC_LOGIN_ERROR = 'Username atau password salah';
const DUMMY_MD5_HASH = md5('__simrs_dummy_timing_pad__');

const FIND_ACTIVE_USER_BY_USERNAME_SQL = `
SELECT
  u.user_id,
  u.person_id,
  u.user_nm,
  u.pwd0,
  u.pgroup_id,
  u.status_cd,
  e.employee_id,
  e.org_id,
  e.profession_id,
  p.profession_type
FROM xocp_users u
LEFT JOIN xocp_ehr_employee e
  ON e.person_id = u.person_id
  AND u.person_id > 0
  AND e.status_cd <> 'nullified'
LEFT JOIN xocp_master_hrd_profession p
  ON p.profession_id = e.profession_id
WHERE u.user_nm = ?
  AND u.status_cd = 'active'
ORDER BY
  CASE WHEN e.status_cd = 'active' THEN 0 ELSE 1 END ASC,
  e.employee_id DESC
LIMIT 1
`;

const FIND_ACTIVE_USER_BY_ID_SQL = `
SELECT
  u.user_id,
  u.person_id,
  u.user_nm,
  u.pgroup_id,
  u.status_cd,
  e.employee_id,
  e.org_id,
  e.profession_id,
  p.profession_type
FROM xocp_users u
LEFT JOIN xocp_ehr_employee e
  ON e.person_id = u.person_id
  AND u.person_id > 0
  AND e.status_cd <> 'nullified'
LEFT JOIN xocp_master_hrd_profession p
  ON p.profession_id = e.profession_id
WHERE u.user_id = ?
  AND u.status_cd = 'active'
ORDER BY
  CASE WHEN e.status_cd = 'active' THEN 0 ELSE 1 END ASC,
  e.employee_id DESC
LIMIT 1
`;

const UPDATE_LAST_LOGIN_SQL = `
UPDATE xocp_users
SET last_login = ?
WHERE user_id = ?
`;

async function login({ user_nm, password }, meta) {
  const [rows] = await pool.execute(FIND_ACTIVE_USER_BY_USERNAME_SQL, [user_nm]);
  const user = rows.length > 0 ? rows[0] : null;

  // Always compute MD5 and run timing-safe comparison even if user is not found
  const inputHash = md5(password);
  const storedHash = user && user.pwd0 ? String(user.pwd0).trim().toLowerCase() : DUMMY_MD5_HASH;
  const passwordMatches = timingSafeEqualStr(inputHash, storedHash);

  if (!user || !passwordMatches) {
    await incrementLoginFailure(meta.ip, user_nm);

    logAudit({
      user_id: user ? user.user_id : null,
      person_id: user ? user.person_id : null,
      profession_id: user ? (user.profession_id ?? null) : null,
      org_id: user ? (user.org_id ?? null) : null,
      endpoint: meta.endpoint,
      method: meta.method,
      action: 'login_failed',
      ip: meta.ip,
      user_agent: meta.userAgent,
      status: 'failed',
      reason: !user ? 'user_not_found_or_inactive' : 'invalid_password',
    });

    throw new AppError(401, GENERIC_LOGIN_ERROR);
  }

  if (user.profession_type !== 'doctor') {
    await incrementLoginFailure(meta.ip, user_nm);

    logAudit({
      user_id: user.user_id,
      person_id: user.person_id,
      profession_id: user.profession_id ?? null,
      org_id: user.org_id ?? null,
      endpoint: meta.endpoint,
      method: meta.method,
      action: 'login_denied_non_doctor',
      ip: meta.ip,
      user_agent: meta.userAgent,
      status: 'denied',
      reason: 'non_doctor_account',
    });

    throw new AppError(403, 'Aplikasi ini khusus untuk dokter');
  }

  await resetLoginFailures(meta.ip, user_nm);

  if (env.ENABLE_LAST_LOGIN_UPDATE) {
    const nowUnix = Math.floor(Date.now() / 1000);
    await pool.execute(UPDATE_LAST_LOGIN_SQL, [nowUnix, user.user_id]);
  }

  const { sessionId, refreshToken, remainingTtlSec } =
    await tokenService.createRefreshSession(user.user_id);
  const accessToken = tokenService.signAccessToken(user, sessionId);

  logAudit({
    user_id: user.user_id,
    person_id: user.person_id,
    profession_id: user.profession_id ?? null,
    org_id: user.org_id ?? null,
    endpoint: meta.endpoint,
    method: meta.method,
    action: 'login_success',
    ip: meta.ip,
    user_agent: meta.userAgent,
    status: 'success',
    reason: null,
  });

  return {
    accessToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    refreshToken,
    remainingTtlSec,
  };
}

async function refresh(rawRefreshToken, meta) {
  const parsed = tokenService.parseRefreshToken(rawRefreshToken);
  if (!parsed) {
    logAudit({
      endpoint: meta.endpoint,
      method: meta.method,
      action: 'refresh_failed',
      ip: meta.ip,
      user_agent: meta.userAgent,
      status: 'failed',
      reason: 'missing_or_malformed_refresh_token',
    });
    throw new AppError(401, 'Sesi tidak valid atau sudah kedaluwarsa');
  }

  const [rows] = await pool.execute(FIND_ACTIVE_USER_BY_ID_SQL, [parsed.userId]);
  const user = rows.length > 0 ? rows[0] : null;

  if (!user || user.profession_type !== 'doctor') {
    await tokenService.deleteRefreshSession(parsed.userId, parsed.sessionId);

    logAudit({
      user_id: parsed.userId,
      person_id: user ? user.person_id : null,
      profession_id: user ? (user.profession_id ?? null) : null,
      org_id: user ? (user.org_id ?? null) : null,
      endpoint: meta.endpoint,
      method: meta.method,
      action: 'refresh_failed',
      ip: meta.ip,
      user_agent: meta.userAgent,
      status: 'failed',
      reason: !user ? 'user_inactive_or_not_found' : 'non_doctor_account',
    });

    throw new AppError(401, 'Sesi tidak valid atau pengguna sudah tidak aktif');
  }

  const rotation = await tokenService.rotateRefreshSession(
    parsed.userId,
    parsed.sessionId,
    parsed.secret
  );

  if (rotation.status !== 'OK') {
    const reasonMap = {
      MISMATCH: 'refresh_token_reuse_detected',
      EXPIRED: 'refresh_session_expired',
      MISSING: 'refresh_session_not_found',
      INVALID: 'refresh_session_corrupted',
    };

    logAudit({
      user_id: user.user_id,
      person_id: user.person_id,
      profession_id: user.profession_id ?? null,
      org_id: user.org_id ?? null,
      endpoint: meta.endpoint,
      method: meta.method,
      action: 'refresh_failed',
      ip: meta.ip,
      user_agent: meta.userAgent,
      status: 'failed',
      reason: reasonMap[rotation.status] || 'refresh_rotation_failed',
    });

    throw new AppError(401, 'Sesi tidak valid atau sudah kedaluwarsa');
  }

  const accessToken = tokenService.signAccessToken(user, parsed.sessionId);

  return {
    accessToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    refreshToken: rotation.refreshToken,
    remainingTtlSec: rotation.remainingTtlSec,
  };
}

async function logout(user, tokenMeta, meta) {
  await tokenService.blacklistAccessToken(tokenMeta.jti, tokenMeta.exp);
  await tokenService.deleteRefreshSession(user.user_id, user.sid);

  logAudit({
    user_id: user.user_id,
    person_id: user.person_id,
    profession_id: user.profession_id ?? null,
    org_id: user.org_id ?? null,
    endpoint: meta.endpoint,
    method: meta.method,
    action: 'logout',
    ip: meta.ip,
    user_agent: meta.userAgent,
    status: 'success',
    reason: null,
  });
}

module.exports = {
  login,
  refresh,
  logout,
};

