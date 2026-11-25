'use strict';

const { maskNik } = require('./crypto');

/**
 * Masks the `nik` query parameter value in a URL path using maskNik().
 * Preserves literal '*' characters (e.g. /api/patients/by-nik?nik=3404********0001).
 * Never throws on malformed URLs.
 */
function maskUrlNik(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return rawUrl || '';
  }

  const qIndex = rawUrl.indexOf('?');
  if (qIndex === -1) {
    return rawUrl;
  }

  const pathname = rawUrl.slice(0, qIndex);
  const queryString = rawUrl.slice(qIndex + 1);

  const maskedQuery = queryString
    .split('&')
    .map((pair) => {
      if (!pair) {
        return pair;
      }

      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        return pair;
      }

      const rawKey = pair.slice(0, eqIndex);
      const rawVal = pair.slice(eqIndex + 1);

      let decodedKey = rawKey;
      try {
        decodedKey = decodeURIComponent(rawKey);
      } catch {
        // Keep raw key on invalid URI escape
      }

      if (decodedKey.toLowerCase() === 'nik') {
        let decodedVal = rawVal;
        try {
          decodedVal = decodeURIComponent(rawVal);
        } catch {
          // Keep raw value on invalid URI escape
        }
        const masked = decodedVal ? maskNik(decodedVal) : '';
        return `${rawKey}=${masked}`;
      }

      return pair;
    })
    .join('&');

  return `${pathname}?${maskedQuery}`;
}

module.exports = {
  maskUrlNik,
};

