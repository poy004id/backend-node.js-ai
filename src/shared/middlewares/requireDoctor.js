'use strict';

const AppError = require('../utils/AppError');

function requireDoctor(req, res, next) {
  if (!req.user || req.user.profession_type !== 'doctor') {
    return next(new AppError(403, 'Aplikasi ini khusus untuk dokter'));
  }
  return next();
}

module.exports = requireDoctor;

