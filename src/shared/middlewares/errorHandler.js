'use strict';

const crypto = require('crypto');
const AppError = require('../utils/AppError');

function notFoundHandler(req, res) {
  return res.status(404).json({
    message: 'Endpoint tidak ditemukan',
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      message: 'Format JSON tidak valid',
    });
  }

  const errorId = crypto.randomUUID();

  // Log server-side error details (including MySQL code/errno/sqlMessage/sql) ONLY to server logs
  const logPayload = {
    error_id: errorId,
    name: err && err.name ? err.name : 'Error',
    message: err && err.message ? err.message : 'Unknown error',
    code: err && err.code ? err.code : undefined,
    errno: err && err.errno ? err.errno : undefined,
    sqlState: err && err.sqlState ? err.sqlState : undefined,
    sqlMessage: err && err.sqlMessage ? err.sqlMessage : undefined,
    sql: err && err.sql ? err.sql : undefined,
    stack: err && err.stack ? err.stack : undefined,
  };

  console.error('[SERVER_ERROR]', JSON.stringify(logPayload));

  return res.status(500).json({
    message: 'Terjadi kesalahan pada server',
    error_id: errorId,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

