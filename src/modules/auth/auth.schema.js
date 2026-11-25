'use strict';

const { z } = require('zod');

const loginBodySchema = z.object({
  user_nm: z
    .string({ required_error: 'user_nm wajib diisi' })
    .trim()
    .min(1, 'user_nm tidak boleh kosong')
    .max(30, 'user_nm maksimal 30 karakter'),
  password: z
    .string({ required_error: 'password wajib diisi' })
    .min(1, 'password tidak boleh kosong')
    .max(255, 'password terlalu panjang'),
});

const emptyObjectSchema = z.object({});

module.exports = {
  loginBodySchema,
  emptyObjectSchema,
};

