'use strict';

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./shared/config/env');
const { maskUrlNik } = require('./shared/utils/urlMask');
const {
  notFoundHandler,
  errorHandler,
} = require('./shared/middlewares/errorHandler');

const authRouter = require('./modules/auth/auth.router');
const userRouter = require('./modules/user/user.router');
const patientRouter = require('./modules/patient/patient.router');

const app = express();

app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet());
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// Custom morgan tokens — never use built-in formats (dev/combined/common/short/tiny)
// and never log Authorization header, cookies, or request body.
morgan.token('masked-url', (req) => maskUrlNik(req.originalUrl || req.url));
morgan.token('client-ip', (req) => req.ip || '-');

const morganFormat =
  env.NODE_ENV === 'production'
    ? ':date[iso] :client-ip :method :masked-url :status :response-time ms ":user-agent"'
    : ':method :masked-url :status :response-time ms';

app.use(
  morgan(morganFormat, {
    skip: (req) => req.method === 'GET' && req.path === '/health',
  })
);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Mount feature module routers — add future modules as one line here
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/patients', patientRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

