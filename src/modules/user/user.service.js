'use strict';

const { pool } = require('../../shared/db/mysql');
const AppError = require('../../shared/utils/AppError');

const GET_DOCTOR_PROFILE_SQL = `
SELECT
  u.user_id,
  u.user_nm,
  u.person_id,
  ps.person_nm,
  ps.prefix_title,
  ps.suffix_title,
  e.employee_id,
  e.profession_id,
  e.org_id,
  pr.profession_nm,
  pr.profession_type
FROM xocp_users u
LEFT JOIN xocp_persons ps
  ON ps.person_id = u.person_id
  AND u.person_id > 0
  AND ps.status_cd <> 'nullified'
LEFT JOIN xocp_ehr_employee e
  ON e.person_id = u.person_id
  AND u.person_id > 0
  AND e.status_cd <> 'nullified'
LEFT JOIN xocp_master_hrd_profession pr
  ON pr.profession_id = e.profession_id
WHERE u.user_id = ?
  AND u.status_cd = 'active'
ORDER BY
  CASE WHEN e.status_cd = 'active' THEN 0 ELSE 1 END ASC,
  e.employee_id DESC
LIMIT 1
`;

function buildDisplayName(prefixTitle, personNm, suffixTitle) {
  return [prefixTitle, personNm, suffixTitle]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ');
}

async function getMyProfile(userId) {
  const [rows] = await pool.execute(GET_DOCTOR_PROFILE_SQL, [userId]);
  if (rows.length === 0) {
    throw new AppError(404, 'Profil pengguna tidak ditemukan');
  }

  const row = rows[0];

  return {
    user_id: row.user_id,
    user_nm: typeof row.user_nm === 'string' ? row.user_nm.trim() : row.user_nm,
    person_id: row.person_id,
    display_name: buildDisplayName(row.prefix_title, row.person_nm, row.suffix_title),
    profession_id: row.profession_id ?? null,
    profession_nm: row.profession_nm ?? null,
    org_id: row.org_id ?? null,
  };
}

module.exports = {
  getMyProfile,
};

