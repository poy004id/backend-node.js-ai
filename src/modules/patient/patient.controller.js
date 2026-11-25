'use strict';

const patientService = require('./patient.service');

async function getByNik(req, res, next) {
  try {
    const { nik } = req.query;
    const result = await patientService.findByNik(nik, req.user, {
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
      endpoint: req.baseUrl + req.path,
      method: req.method,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getByNik,
};

