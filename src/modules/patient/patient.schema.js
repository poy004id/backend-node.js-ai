'use strict';

const { z } = require('zod');

const byNikQuerySchema = z.object({
  nik: z
    .string({
      required_error:
        'Parameter nik wajib diisi. Pencarian ini khusus untuk NIK (16 digit angka).',
      invalid_type_error:
        'Parameter nik harus berupa 16 digit angka. Pencarian ini khusus untuk NIK.',
    })
    .trim()
    .regex(
      /^\d{16}$/,
      'NIK harus terdiri dari 16 digit angka. Pencarian ini khusus untuk NIK dan tidak mendukung nomor paspor atau identitas lainnya.'
    ),
});

const emptyObjectSchema = z.object({});

module.exports = {
  byNikQuerySchema,
  emptyObjectSchema,
};

