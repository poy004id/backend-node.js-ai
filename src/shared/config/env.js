'use strict';

require('dotenv').config();
const { z } = require('zod');

const booleanString = (defaultVal) =>
  z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .default(defaultVal)
    .transform((val) => val === true || val === 'true');

const trustProxySchema = z
  .union([z.boolean(), z.number(), z.string()])
  .optional()
  .default('false')
  .transform((val) => {
    if (typeof val === 'boolean' || typeof val === 'number') {
      return val;
    }
    const trimmed = val.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'false' || trimmed === '0') {
      return false;
    }
    if (trimmed.toLowerCase() === 'true') {
      return true;
    }
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY: trustProxySchema,

  DB_HOST: z.string().min(1, 'DB_HOST wajib diisi'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1, 'DB_USER wajib diisi'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1, 'DB_NAME wajib diisi'),
  ENABLE_LAST_LOGIN_UPDATE: booleanString('false'),

  REDIS_HOST: z.string().min(1, 'REDIS_HOST wajib diisi'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_KEY_PREFIX: z
    .string()
    .default('demo:')
    .refine((v) => v.startsWith('demo:'), {
      message: "REDIS_KEY_PREFIX wajib berawalan 'demo:'",
    }),

  MONGO_URI: z.string().optional().default(''),
  MONGO_DB: z.string().optional().default('simrs_audit'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET wajib minimal 32 karakter'),
  JWT_ISSUER: z.string().min(1, 'JWT_ISSUER wajib diisi').default('simrs-rsa-ugm'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(28800),

  NIK_ENCRYPT_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'NIK_ENCRYPT_KEY wajib berupa 64 karakter hex (32 byte)'),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_WINDOW_SEC: z.coerce.number().int().positive().default(60),
  COOKIE_SECURE: booleanString('false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[CONFIG_ERROR] Konfigurasi environment (.env) tidak valid:');
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || '(root)';
    console.error(`  - ${key}: ${issue.message}`);
  }
  process.exit(1);
}

const env = Object.freeze(parsed.data);

module.exports = env;

