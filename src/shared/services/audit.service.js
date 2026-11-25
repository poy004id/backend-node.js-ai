'use strict';

const { getAuditCollection } = require('../db/mongo');
const { maskNik } = require('../utils/crypto');

/**
 * Fire-and-forget audit logger.
 * Writes to MongoDB `audit_logs` collection if available; otherwise prints to console.
 * Never awaited on the HTTP response path.
 */
function logAudit(event) {
  const doc = {
    user_id: event.user_id ?? null,
    person_id: event.person_id ?? null,
    profession_id: event.profession_id ?? null,
    org_id: event.org_id ?? null,
    endpoint: event.endpoint ?? null,
    method: event.method ?? null,
    action: event.action ?? null,
    target_person_ids: Array.isArray(event.target_person_ids)
      ? event.target_person_ids
      : [],
    nik_masked:
      event.nik_masked !== undefined
        ? event.nik_masked
        : event.nik
          ? maskNik(event.nik)
          : null,
    ip: event.ip ?? null,
    user_agent: event.user_agent ?? null,
    status: event.status ?? null,
    reason: event.reason ?? null,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  const collection = getAuditCollection();
  if (!collection) {
    console.log('[AUDIT_LOG]', JSON.stringify(doc));
    return;
  }

  collection.insertOne(doc).catch((err) => {
    console.error('[AUDIT_LOG_ERROR]', err.message);
    console.log('[AUDIT_LOG]', JSON.stringify(doc));
  });
}

module.exports = {
  logAudit,
};

