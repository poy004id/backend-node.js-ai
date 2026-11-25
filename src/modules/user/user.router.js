'use strict';

const express = require('express');
const { z } = require('zod');
const authenticate = require('../../shared/middlewares/authenticate');
const requireDoctor = require('../../shared/middlewares/requireDoctor');
const validate = require('../../shared/middlewares/validate');
const userController = require('./user.controller');

const router = express.Router();
const emptyObjectSchema = z.object({});

router.use(authenticate, requireDoctor);

router.get(
  '/me',
  validate({
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  }),
  userController.getMe
);

module.exports = router;

