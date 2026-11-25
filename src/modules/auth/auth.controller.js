'use strict';

const authService = require('./auth.service');
const tokenService = require('./token.service');

function buildRequestMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
    endpoint: req.baseUrl + req.path,
    method: req.method,
  };
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, buildRequestMeta(req));

    res.cookie(
      tokenService.REFRESH_COOKIE_NAME,
      result.refreshToken,
      tokenService.getRefreshCookieOptions(result.remainingTtlSec)
    );

    return res.status(200).json({
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
    });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const rawRefreshToken = req.cookies
      ? req.cookies[tokenService.REFRESH_COOKIE_NAME]
      : undefined;

    const result = await authService.refresh(rawRefreshToken, buildRequestMeta(req));

    res.cookie(
      tokenService.REFRESH_COOKIE_NAME,
      result.refreshToken,
      tokenService.getRefreshCookieOptions(result.remainingTtlSec)
    );

    return res.status(200).json({
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
    });
  } catch (err) {
    if (err && err.statusCode === 401) {
      res.clearCookie(
        tokenService.REFRESH_COOKIE_NAME,
        tokenService.getClearRefreshCookieOptions()
      );
    }
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user, req.tokenMeta, buildRequestMeta(req));

    res.clearCookie(
      tokenService.REFRESH_COOKIE_NAME,
      tokenService.getClearRefreshCookieOptions()
    );

    return res.status(200).json({
      message: 'Logout berhasil',
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
};

