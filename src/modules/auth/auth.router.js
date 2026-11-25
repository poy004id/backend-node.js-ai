'use strict';

const express = require('express');
const validate = require('../../shared/middlewares/validate');
const authenticate = require('../../shared/middlewares/authenticate');
const { loginRateLimit } = require('../../shared/middlewares/loginRateLimit');
const { loginBodySchema, emptyObjectSchema } = require('./auth.schema');
const authController = require('./auth.controller');

const router = express.Router();

router.post(
  '/login',
  validate({
    body: loginBodySchema,
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  }),
  loginRateLimit,
  authController.login
);

router.post(
  '/refresh',
  validate({
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  }),
  authController.refresh
);

router.post(
  '/logout',
  authenticate,
  validate({
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  }),
  authController.logout
);

module.exports = router;

