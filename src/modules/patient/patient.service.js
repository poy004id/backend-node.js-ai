'use strict';

const { pool } = require('../../shared/db/mysql');
const { sha256, safeDecrypt, maskNik } = require('../../shared/utils/crypto');
const AppError = require('../../shared/utils/AppError');
const { logAudit } = require('../../shared/services/audit.service');

// Combined single WHERE: matches both hashed rows and legacy raw rows for the same NIK.
// Intentionally NO LIMIT 1 (ext_id is not UNIQUE; all matching person_id candidates must be returned).
// Intentionally NO del_ind filter (del_ind is unused and always 'y').
const FIND_PERSONS_BY_NIK_SQL = `
SELECT
  ps.person_id,
  ps.ext_id,
  ps.person_nm,
  ps.birth_dttm,
  ps.adm_gender_cd,
  ps.status_cd,
  e.employee_id
FROM xocp_persons ps
LEFT JOIN xocp_ehr_employee e
  ON e.person_id = ps.person_id
  AND e.status_cd <> 'nullified'
WHERE (ps.ext_id_hash = ? OR (ps.ext_id_hash IS NULL AND ps.ext_id = ?))
  AND ps.status_cd <> 'nullified'
ORDER BY ps.person_id ASC
`;

async function findByNik(nik, actor, meta) {
  if (typeof nik !== 'string' || !/^\d{16}$/.test(nik)) {
    throw new AppError(
      400,
      'NIK harus terdiri dari 16 digit angka. Pencarian ini khusus untuk NIK.'
    );
  }

  const nikHash = sha256(nik);
  const [rows] = await pool.execute(FIND_PERSONS_BY_NIK_SQL, [nikHash, nik]);

  // Aggregate joined rows by person_id (one person can have multiple employee rows)
  const candidateMap = new Map();
  for (const row of rows) {
    const existing = candidateMap.get(row.person_id);
    if (!existing) {
      candidateMap.set(row.person_id, {
        person_id: row.person_id,
        nik: safeDecrypt(row.ext_id),
        person_nm: row.person_nm,
        birth_dttm: row.birth_dttm,
        adm_gender_cd: row.adm_gender_cd,
        status_cd: row.status_cd,
        is_employee: Boolean(row.employee_id),
      });
    } else if (row.employee_id) {
      existing.is_employee = true;
    }
  }

  const candidates = Array.from(candidateMap.values());

  logAudit({
    user_id: actor.user_id,
    person_id: actor.person_id,
    profession_id: actor.profession_id ?? null,
    org_id: actor.org_id ?? null,
    endpoint: meta.endpoint,
    method: meta.method,
    action: 'patient_search_by_nik',
    target_person_ids: candidates.map((c) => c.person_id),
    nik_masked: maskNik(nik),
    ip: meta.ip,
    user_agent: meta.userAgent,
    status: 'success',
    reason: candidates.length === 0 ? 'not_found' : null,
  });

  return {
    total: candidates.length,
    has_duplicate: candidates.length > 1,
    candidates,
  };
}

module.exports = {
  findByNik,
};

