'use strict';

const { MongoClient } = require('mongodb');
const env = require('../config/env');

let client = null;
let db = null;

async function connectMongo() {
  if (!env.MONGO_URI) {
    console.warn('[MONGO] MONGO_URI kosong; audit log akan dicetak ke console.');
    return false;
  }

  try {
    client = new MongoClient(env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    await client.connect();
    db = env.MONGO_DB ? client.db(env.MONGO_DB) : client.db();
    await db.command({ ping: 1 });
    console.log('[MONGO] Terhubung ke MongoDB untuk audit log.');
    return true;
  } catch (err) {
    console.warn(
      `[MONGO] Gagal terhubung ke MongoDB (${err.message}); aplikasi tetap berjalan dan audit log dicetak ke console.`
    );
    if (client) {
      await client.close().catch(() => {});
    }
    client = null;
    db = null;
    return false;
  }
}

function getAuditCollection() {
  if (!db) {
    return null;
  }
  return db.collection('audit_logs');
}

async function closeMongo() {
  if (client) {
    await client.close().catch(() => {});
    client = null;
    db = null;
  }
}

module.exports = {
  connectMongo,
  getAuditCollection,
  closeMongo,
};

