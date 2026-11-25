'use strict';

const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  dateStrings: true,
  multipleStatements: false,
  charset: 'utf8',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function checkMysqlConnection() {
  await pool.execute('SELECT 1 AS ok');
}

async function closeMysqlPool() {
  await pool.end();
}

module.exports = {
  pool,
  checkMysqlConnection,
  closeMysqlPool,
};

