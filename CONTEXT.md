# CONTEXT.md — Aturan Engineering Backend SIMRS RSA UGM

Kamu adalah backend engineer yang menulis kode untuk SIMRS Rumah Sakit Akademik UGM.
Patuhi semua aturan di file ini. Jika ada aturan yang tidak bisa dipenuhi, jangan diam-diam menyimpang: tulis alasannya di akhir jawaban.

---

## 1. Produk & Tugas

Backend ini melayani **aplikasi untuk dokter** RSA UGM (web/mobile yang dipakai dokter di poliklinik, IGD, dan bangsal).
Ini adalah **starter project**: baru berisi modul dasar. Modul lain (jadwal praktik, antrean pasien, rekam medis elektronik, resep, dll.) akan ditambahkan kemudian oleh tim. **Jangan membuat modul di luar daftar di bawah**, tapi pastikan strukturnya mudah ditambah modul baru tanpa mengubah modul yang ada.

Modul dan endpoint yang dibangun sekarang:

| Modul | Method | Path | Fungsi |
|---|---|---|---|
| `auth` | POST | `/api/auth/login` | Login dokter → access token + refresh token (cookie) |
| `auth` | POST | `/api/auth/refresh` | Rotasi refresh token → access token baru |
| `auth` | POST | `/api/auth/logout` | Cabut access token + hapus refresh session |
| `user` | GET | `/api/users/me` | Profil dokter yang sedang login (nama, profesi, org) |
| `patient` | GET | `/api/patients/by-nik?nik=` | Semua kandidat person untuk satu NIK |

Pengguna aplikasi adalah dokter:
- Login hanya untuk akun yang `profession_type = 'doctor'`. Akun non-dokter dengan password benar → **403** `"Aplikasi ini khusus untuk dokter"` (dicatat di audit log). Password salah tetap 401 generik.
- Semua endpoint selain `auth` wajib melewati middleware `authenticate` lalu `requireDoctor`.

---

## 2. Environment

- Aplikasi berjalan di laptop developer dan terhubung ke **MySQL 5.5** dan **Redis** di server development existing. Tidak memakai Docker.
- Tabel `xocp_*` sudah ada dan berisi data. **Dilarang** membuat migration, DDL (`CREATE`/`DROP`/`ALTER`/`TRUNCATE`), atau script seed.
- Akses MySQL **hanya `SELECT`**. Satu-satunya pengecualian adalah `UPDATE xocp_users SET last_login`, yang hanya dijalankan jika `ENABLE_LAST_LOGIN_UPDATE=true`.
- Redis dipakai bersama aplikasi lain: semua key **wajib berawalan `demo:`** (gunakan opsi `keyPrefix` ioredis, nilai dari `REDIS_KEY_PREFIX`). Dilarang `FLUSHALL`/`FLUSHDB`/`KEYS *`.
- Redis server bisa versi 5: **dilarang** `GETDEL`, `SET ... EXAT/PXAT`, `SET ... GET`. Operasi atomik pakai `MULTI` atau skrip Lua.
- MongoDB opsional. Jika `MONGO_URI` kosong atau tidak bisa terhubung, aplikasi tetap jalan dan audit log dicetak ke console.

---

## 3. Tech Stack

- Node.js ≥ 18, Express, CommonJS.
- `mysql2/promise` (tanpa ORM, tanpa query builder).
- `ioredis`, `mongodb` (driver native), `zod`, `jsonwebtoken`, `crypto` bawaan Node, `dotenv`, `cookie-parser`, `helmet`, `morgan` (log request HTTP).
- **Tidak dipakai:** Docker, ORM (Prisma/Sequelize/TypeORM), BullMQ/RabbitMQ, bcrypt/argon2, RBAC.

### Arsitektur: Modular / Feature-based

Kode dikelompokkan **per fitur**, bukan per jenis file. Satu modul = satu folder yang berisi semua lapisannya.

```
src/
├── modules/
│   ├── auth/
│   │   ├── auth.router.js       # definisi route + middleware + validasi
│   │   ├── auth.controller.js   # baca req, panggil service, kirim res
│   │   ├── auth.service.js      # logika bisnis + query SQL modul ini
│   │   ├── auth.schema.js       # skema Zod input
│   │   └── token.service.js     # JWT, refresh session, blacklist
│   ├── user/
│   │   ├── user.router.js
│   │   ├── user.controller.js
│   │   └── user.service.js
│   └── patient/
│       ├── patient.router.js
│       ├── patient.controller.js
│       ├── patient.service.js
│       └── patient.schema.js
├── shared/
│   ├── config/env.js            # baca & validasi .env dengan Zod; exit jika tidak valid
│   ├── db/                      # mysql.js, redis.js, mongo.js
│   ├── middlewares/             # authenticate, requireDoctor, loginRateLimit, validate, errorHandler
│   ├── services/audit.service.js
│   └── utils/                   # crypto.js (md5, sha256, safeDecrypt, maskNik), AppError.js
├── app.js                       # pasang middleware global + mount router tiap modul
└── server.js                    # koneksi DB/Redis/Mongo, listen, graceful shutdown
.env.example
```

Aturan arsitektur:
- **Router** hanya berisi route, middleware, dan validasi. **Controller** tidak boleh berisi SQL. **Service** berisi logika bisnis dan query SQL modulnya, tidak boleh menyentuh `req`/`res`.
- Modul **tidak boleh** meng-`require` file internal modul lain. Jika butuh data modul lain, panggil service yang diekspor modul tersebut (misalnya `auth` memakai `user.service.findActiveDoctor...`) atau pindahkan yang dipakai bersama ke `shared/`.
- `app.js` me-mount router: `app.use('/api/auth', authRouter)`, `app.use('/api/users', userRouter)`, `app.use('/api/patients', patientRouter)`. Modul baru cukup ditambah satu baris di sini.
- Nama file `<modul>.<lapisan>.js`, huruf kecil.

Variabel `.env` yang dipakai:
`PORT, TRUST_PROXY, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, ENABLE_LAST_LOGIN_UPDATE, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB, REDIS_KEY_PREFIX, MONGO_URI, MONGO_DB, JWT_SECRET (≥32 karakter), JWT_ISSUER, ACCESS_TOKEN_TTL_SEC=900, REFRESH_TOKEN_TTL_SEC=28800, NIK_ENCRYPT_KEY (64 hex), LOGIN_MAX_ATTEMPTS=5, LOGIN_WINDOW_SEC=60, COOKIE_SECURE`

---

## 4. Aturan MySQL 5.5

1. **Dilarang** sintaks MySQL 5.7/8.0: CTE (`WITH ... AS`), window function (`ROW_NUMBER()`, `OVER()`), tipe/fungsi `JSON` (`JSON_EXTRACT`, `->>`, dll.).
2. Semua query memakai prepared statement `pool.execute(sql, params)` dengan placeholder `?`. Dilarang template string `${}` atau konkatenasi di SQL. `multipleStatements: false`.
3. Pool wajib `dateStrings: true`, karena data lama berisi `0000-00-00 00:00:00`.
4. Tidak ada FOREIGN KEY fisik; relasi dijaga di kode.
5. Join dari `xocp_users` ke `xocp_ehr_employee` dan `xocp_master_hrd_profession` **wajib `LEFT JOIN`**.
6. Charset tabel `utf8` (bukan `utf8mb4`).

---

## 5. Skema (kolom yang relevan)

```sql
-- xocp_users
user_id     INT UNSIGNED PK AUTO_INCREMENT
person_id   INT UNSIGNED NOT NULL DEFAULT 0
user_nm     CHAR(30) NOT NULL UNIQUE
pwd0        CHAR(32) NOT NULL            -- MD5 hex dari password
pwd1        CHAR(32) NOT NULL            -- tidak dipakai, abaikan
pgroup_id   INT UNSIGNED NOT NULL DEFAULT 0
status_cd   ENUM('active','inactive','nullified') NOT NULL DEFAULT 'inactive'
last_login  INT UNSIGNED NOT NULL DEFAULT 0   -- unix timestamp (detik)

-- xocp_persons
person_id     INT UNSIGNED PK AUTO_INCREMENT
ext_id        VARCHAR(255) NOT NULL      -- NIK pasien, TIDAK unique, akan dual-state (lihat bagian 6)
ext_id_hash   CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL  -- SHA-256 hex NIK
person_nm     VARCHAR(100) NOT NULL
prefix_title  VARCHAR(100) NULL          -- gelar depan, mis. "dr."
suffix_title  VARCHAR(100) NULL          -- gelar belakang, mis. "Sp.PD"
birth_dttm    DATETIME NOT NULL          -- bisa '0000-00-00 00:00:00'
birthplace    VARCHAR(50) NOT NULL
adm_gender_cd ENUM('m','f') NOT NULL DEFAULT 'm'
nationality_nm CHAR(255) NOT NULL        -- kewarganegaraan (isian bebas, tidak standar)
status_cd     ENUM('new','active','inactive','normal','nullified') NOT NULL DEFAULT 'active'
del_ind       ENUM('n','y') NOT NULL DEFAULT 'y'   -- tidak dipakai, abaikan
KEY idx_ext_id_hash (ext_id_hash), KEY ext_id (ext_id)

-- xocp_ehr_employee
employee_id   INT UNSIGNED PK AUTO_INCREMENT
person_id     INT UNSIGNED NOT NULL DEFAULT 0
profession_id INT NULL
org_id        INT NOT NULL
status_cd     ENUM('new','inactive','active','suspended','terminated','nullified') NOT NULL DEFAULT 'new'
KEY x_emp_person (person_id)

-- xocp_master_hrd_profession   (tanpa primary key)
profession_id   INT NOT NULL
profession_nm   VARCHAR(200) NOT NULL
profession_type ENUM('doctor','paramedic','administration','dr_internship') NULL
```

---

## 6. Aturan Bisnis & Anomali Data

### Login
- Cari user dengan `user_nm`. Password: `md5(input)` dibandingkan dengan `pwd0` memakai `crypto.timingSafeEqual`. Abaikan `pwd1`.
- Wajib filter `status_cd = 'active'`.
- Jika user tidak ditemukan, tetap hitung MD5 dan bandingkan dengan hash dummy supaya waktu respons serupa.
- Satu person bisa punya lebih dari satu baris `xocp_ehr_employee`: urutkan employee aktif dulu, lalu `employee_id` terbaru. `LIMIT 1` di query login boleh karena `user_nm` unik.

### Person & NIK
- **Abaikan `del_ind`**: semua baris bernilai `'y'`; `WHERE del_ind = 'n'` mengembalikan 0 baris. Baris aktif = `status_cd <> 'nullified'`.
- Tidak ada kolom `encrypted_nik`. Jangan menambah kolom atau mengubah skema.
- **`ext_id` tidak punya index UNIQUE** (hanya index biasa `KEY ext_id`). Database tidak menjamin satu NIK = satu baris:
  - jangan pernah berasumsi NIK unik: tanpa `findOne`, tanpa `LIMIT 1`, tanpa `rows[0]` pada hasil pencarian NIK;
  - jangan memakai `ext_id` sebagai kunci relasi atau kunci cache;
  - ada baris dengan `ext_id` kosong (`''`); jangan pernah mencari dengan nilai kosong.
- **Tidak ada kolom nomor paspor**, padahal banyak pasien berkewarganegaraan asing (WNA):
  - pasien WNA tidak punya NIK, jadi tidak bisa ditemukan lewat `by-nik`; ini batasan yang disadari, bukan bug;
  - jangan menambah kolom paspor dan jangan menebak paspor disimpan di kolom mana (`ext_id`, `ssn`, atau lainnya);
  - jangan memakai `nationality_nm` untuk logika (isiannya bebas dan tidak standar);
  - validasi `nik` tetap 16 digit angka; input selain itu ditolak 400 dengan pesan yang menjelaskan bahwa pencarian ini khusus NIK.
- `ext_id` saat ini berisi NIK raw. Tim lain **sedang menyiapkan** enkripsi: nantinya NIK baru disimpan terenkripsi dengan `NIK_ENCRYPT_KEY` di kolom yang sama, sehingga kolom ini akan berisi dua bentuk sekaligus (dual-state). Belum ada data terenkripsi, tetapi kode **wajib sudah mendukungnya** sekarang. Desain ini milik tim lain dan tidak boleh diubah.
- Buat helper `safeDecrypt(value)`: coba dekripsi; jika gagal, kembalikan `value` apa adanya. Tidak boleh melempar error. Taruh semua logika enkripsi di `utils/crypto.js` agar format ciphertext mudah disesuaikan.
- `ext_id_hash` = SHA-256 hex (huruf kecil, 64 karakter) dari NIK. Banyak baris masih `NULL`.
- Query pencarian NIK **wajib** menggabungkan kedua kondisi dalam satu `WHERE`:
  ```sql
  WHERE (ps.ext_id_hash = ? OR (ps.ext_id_hash IS NULL AND ps.ext_id = ?))
    AND ps.status_cd <> 'nullified'
  ```
  Jangan menulisnya sebagai "cari hash dulu, kalau tidak ketemu baru cari `ext_id`". Satu NIK bisa punya baris yang sudah di-hash **dan** baris lama yang masih raw; keduanya harus muncul.
- **Duplikasi `person_id`**: karena `ext_id` tidak unique, satu NIK bisa punya beberapa baris. Paling sering pegawai yang juga terdaftar sebagai pasien, tapi bisa juga pasien yang terdaftar lebih dari sekali. Pada `GET /api/patients/by-nik`:
  - **dilarang `LIMIT 1`**, dilarang auto-merge, dilarang mengubah `person_id`;
  - `LEFT JOIN xocp_ehr_employee` via `person_id`, gabungkan hasil per `person_id`;
  - kembalikan `{ total, has_duplicate, candidates: [...] }`, tiap kandidat berisi `person_id, nik (hasil safeDecrypt), person_nm, birth_dttm, adm_gender_cd, status_cd, is_employee: Boolean(employee_id)`.

### Profil dokter (`GET /api/users/me`)
- Ambil berdasarkan `user_id` dari token: `xocp_users` → `LEFT JOIN xocp_persons` (`person_nm`, `prefix_title`, `suffix_title`) → `LEFT JOIN xocp_ehr_employee` → `LEFT JOIN xocp_master_hrd_profession` (`profession_nm`, `profession_type`).
- Kembalikan `user_id, user_nm, person_id, display_name` (gabungan gelar depan + nama + gelar belakang, abaikan yang kosong), `profession_id, profession_nm, org_id`.
- **Jangan** mengembalikan NIK, `pwd0`, atau kolom lain di luar daftar ini.

### Otorisasi
- Belum ada RBAC. Jangan membuat tabel, role, atau middleware RBAC.
- Hanya `profession_type = 'doctor'` yang datanya bisa dipercaya. Nilai lain (`NULL`, tidak konsisten) tidak boleh dipakai untuk otorisasi. Middleware `requireDoctor` mengecek klaim `profession_type === 'doctor'` di access token dan dipasang di semua modul selain `auth`.

---

## 7. Keamanan API

### Redis keys (ditulis tanpa prefix; `keyPrefix` menambahkan `demo:`)
| Key | Nilai | TTL |
|---|---|---|
| `ratelimit:login:<ip>:<user_nm lowercase>` | jumlah login gagal | `LOGIN_WINDOW_SEC` |
| `refresh:<user_id>:<session_id>` | `<sha256(secret)>|<exp_unix>` | sisa umur sesi |
| `blacklist:<jti>` | `1` | `exp - now` |

### Rate limit login
- Key = IP + username, karena komputer poliklinik/IGD keluar lewat satu IP NAT. Jangan memblokir berdasarkan IP saja.
- Maksimal `LOGIN_MAX_ATTEMPTS` gagal per window → HTTP 429 dengan `retry_after_sec`.
- Hanya login gagal yang dihitung; login sukses menghapus counter.
- `app.set('trust proxy', TRUST_PROXY)` agar `req.ip` benar di belakang Nginx.

### Access token
- HS256, `expiresIn` = `ACCESS_TOKEN_TTL_SEC` (15 menit), `jwtid` = UUID, `issuer` = `JWT_ISSUER`.
- Klaim hanya: `user_id, person_id, org_id, profession_id, profession_type, pgroup_id, sid`.
- **Dilarang** memasukkan NIK/`ext_id`, nama, atau hash password ke payload.
- Verifikasi dengan `algorithms: ['HS256']`.
- Respons login/refresh hanya `{ access_token, token_type: 'Bearer', expires_in }`. Jangan kirim objek user mentah.

### Refresh token
- Umur absolut 1 shift (`REFRESH_TOKEN_TTL_SEC`, 8 jam), tidak diperpanjang saat rotasi.
- Dikirim sebagai cookie `HttpOnly; SameSite=Strict; Path=/api/auth`, `Secure` jika `COOKIE_SECURE=true`.
- Simpan hanya hash secret di Redis.
- Setiap `/api/auth/refresh`: secret lama hangus, secret baru diterbitkan (rotasi atomik). Jika secret yang dikirim tidak cocok (indikasi token lama dipakai ulang), hapus sesi dan balas 401.
- Saat refresh, ambil ulang data user; jika user sudah tidak aktif, hapus sesi dan balas 401.

### Logout
- Wajib terautentikasi. Simpan `blacklist:<jti>` dengan TTL sisa umur token, hapus `refresh:<user_id>:<sid>`, hapus cookie.
- Middleware auth wajib menolak token yang `jti`-nya ada di blacklist.

### Validasi & error
- Semua input (body, query, params) divalidasi dengan Zod. Input tidak valid → 400 dengan daftar field.
- Login gagal karena alasan apa pun → 401 dengan pesan yang sama persis: `"Username atau password salah"`.
- Global error handler: error tak terduga → 500 `{ message: "Terjadi kesalahan pada server", error_id }`. Pesan, kode, dan SQL dari error MySQL hanya boleh masuk log server.
- Semua secret di `.env` dan divalidasi saat startup. Tidak ada nilai rahasia hardcoded.

---

## 8. Audit Trail

- Catat: login (sukses, gagal, diblokir rate limit), refresh gagal, logout, dan **setiap** akses `GET /api/patients/by-nik`.
- Fire-and-forget: `collection.insertOne(doc).catch(...)`, tidak di-`await` di jalur respons. Jika Mongo tidak tersedia: `console.log('[AUDIT_LOG]', JSON.stringify(doc))`.
- Koleksi `audit_logs`. Field: `user_id, person_id, profession_id, org_id, endpoint, method, action, target_person_ids, nik_masked, ip, user_agent, status, reason, timestamp`.
- NIK **wajib disensor** sebelum disimpan: 4 digit awal + `*` + 4 digit akhir (`3404********0001`).

### Log request HTTP (morgan)
Audit log di atas hanya untuk akses data sensitif. Selain itu, **setiap request** wajib tercatat di stdout agar developer bisa memastikan request sampai ke backend, termasuk yang ditolak 400, 401, 404, atau 429.
- Pasang `morgan` di `app.js` sebelum router, dengan **format sendiri** (token kustom). Jangan memakai format bawaan (`dev`, `combined`, `common`, `short`, `tiny`): semuanya mencatat URL lengkap, sehingga `GET /api/patients/by-nik?nik=3404010101800001` membocorkan NIK utuh ke log.
- Token URL kustom wajib menyensor nilai query `nik` dengan fungsi sensor yang sama dengan audit log (`3404********0001`). Taruh fungsi penyensoran URL di `shared/utils/`.
- Isi minimal: method, URL tersensor, status, durasi (ms). Di produksi tambahkan waktu, IP (`req.ip`, menghormati `trust proxy`), dan user agent.
- **Dilarang** mencatat header `Authorization`, cookie, maupun body request (berisi password).
- Lewati `GET /health` (opsi `skip`) agar log tidak penuh.
- Contoh baris: `GET /api/patients/by-nik?nik=3404********0001 200 12.3 ms`.

---

## 9. Self-Audit Checklist

Setelah selesai, periksa kodemu sendiri dan laporkan status tiap poin (✅/❌ + lokasi file):

1. Tidak ada secret/kredensial hardcoded.
2. Semua SQL memakai `?`, tanpa `${}`.
3. Tanpa CTE, window function, JSON; pool `dateStrings: true`.
4. Password diverifikasi MD5 terhadap `pwd0`, bukan bcrypt.
5. Login memfilter `status_cd = 'active'`; tidak ada `del_ind` di query mana pun.
6. `LEFT JOIN` ke employee dan profesi.
7. Pesan login gagal identik untuk semua penyebab.
8. Rate limit IP + username, semua key Redis berawalan `demo:`, tanpa perintah Redis ≥ 6.2.
9. Access token 15 menit dengan `jti`, payload tanpa NIK, respons tanpa data user mentah.
10. Logout memasukkan `jti` ke blacklist dan middleware mengeceknya.
11. Pencarian NIK memakai kondisi `OR` gabungan, `safeDecrypt`, tanpa `LIMIT 1`/`findOne`/`rows[0]`, ada `is_employee`; tidak ada asumsi `ext_id` unik; tidak ada kolom atau logika paspor yang ditebak.
12. Error SQL tidak pernah sampai ke client; akses by-nik tercatat dengan NIK tersensor.
13. Hanya `SELECT` ke MySQL (kecuali `last_login` di balik flag).
14. Struktur modular sesuai bagian 3: tidak ada SQL di controller, tidak ada `req`/`res` di service, modul tidak saling `require` file internal.
15. Login non-dokter ditolak 403; semua route `user` dan `patient` memakai `authenticate` + `requireDoctor`.
16. Setiap request tercatat lewat morgan dengan format sendiri: NIK di URL tersensor, tanpa header `Authorization`/cookie/body, `/health` dilewati.
