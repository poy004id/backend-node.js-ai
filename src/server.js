'use strict';

// Validate environment variables before loading anything else
const env = require('./shared/config/env');
const { checkMysqlConnection, closeMysqlPool } = require('./shared/db/mysql');
const { connectRedis, closeRedis } = require('./shared/db/redis');
const { connectMongo, closeMongo } = require('./shared/db/mongo');
const app = require('./app');

let server = null;
let isShuttingDown = false;

async function start() {
  try {
    await checkMysqlConnection();
    console.log('[MYSQL] Terhubung ke MySQL.');

    await connectRedis();
    console.log('[REDIS] Terhubung ke Redis.');

    // MongoDB is optional; failure does not block server startup
    await connectMongo();

    server = app.listen(env.PORT, () => {
      console.log(
        `[SERVER] Backend aplikasi dokter RSA UGM berjalan di port ${env.PORT} (${env.NODE_ENV})`
      );
    });
  } catch (err) {
    console.error('[STARTUP_ERROR] Gagal memulai server:', err.message);
    await Promise.allSettled([closeMongo(), closeRedis(), closeMysqlPool()]);
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`[SERVER] Menerima sinyal ${signal}, memulai graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[SERVER] Graceful shutdown timeout, memaksa keluar.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await Promise.allSettled([closeMongo(), closeRedis(), closeMysqlPool()]);
    clearTimeout(forceExitTimer);
    console.log('[SERVER] Shutdown selesai.');
    process.exit(0);
  } catch (err) {
    console.error('[SHUTDOWN_ERROR]', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();

