'use strict';

const express = require('express');
const authenticate = require('../../shared/middlewares/authenticate');
const requireDoctor = require('../../shared/middlewares/requireDoctor');
const validate = require('../../shared/middlewares/validate');
const { byNikQuerySchema, emptyObjectSchema } = require('./patient.schema');
const patientController = require('./patient.controller');

const router = express.Router();

router.use(authenticate, requireDoctor);

router.get(
  '/by-nik',
  validate({
    query: byNikQuerySchema,
    params: emptyObjectSchema,
  }),
  patientController.getByNik
);

module.exports = router;

