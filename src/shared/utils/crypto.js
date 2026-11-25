'use strict';

const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

const nikKeyBuffer = Buffer.from(env.NIK_ENCRYPT_KEY, 'hex');

function md5(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

/**
 * Constant-time string comparison safe against different buffer lengths.
 */
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');

  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to keep timing profile consistent
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Mask NIK for audit logs and HTTP logs: 4 first chars + '*' + 4 last chars.
 * Example: '3404010101800001' -> '3404********0001'
 */
function maskNik(nik) {
  if (nik === null || nik === undefined) {
    return null;
  }
  const str = String(nik).trim();
  if (str.length === 0) {
    return '';
  }
  if (str.length <= 8) {
    return '*'.repeat(str.length);
  }
  const prefix = str.slice(0, 4);
  const suffix = str.slice(-4);
  const maskedMiddle = '*'.repeat(str.length - 8);
  return `${prefix}${maskedMiddle}${suffix}`;
}

/**
 * Encrypt NIK using AES-256-GCM.
 * Wire format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 * Isolated here so the ciphertext format can be adjusted easily when finalized.
 */
function encryptNik(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, nikKeyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Dual-state decrypt helper for xocp_persons.ext_id.
 * Attempts AES-256-GCM decryption; if decryption fails or input is raw plaintext,
 * returns the original value as-is without throwing.
 */
function safeDecrypt(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  // Fast-path for plain 16-digit raw NIK
  if (/^\d{16}$/.test(value)) {
    return value;
  }

  try {
    const parts = value.split(':');
    if (parts.length !== 3) {
      return value;
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    if (
      ivHex.length !== IV_LENGTH_BYTES * 2 ||
      authTagHex.length !== AUTH_TAG_LENGTH_BYTES * 2 ||
      ciphertextHex.length === 0 ||
      ciphertextHex.length % 2 !== 0 ||
      !HEX_PATTERN.test(ivHex) ||
      !HEX_PATTERN.test(authTagHex) ||
      !HEX_PATTERN.test(ciphertextHex)
    ) {
      return value;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, nikKeyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return value;
  }
}

module.exports = {
  md5,
  sha256,
  timingSafeEqualStr,
  maskNik,
  encryptNik,
  safeDecrypt,
};

