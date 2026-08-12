# CURHAT DONG — Ringkasan Pengerjaan

> Laporan berjalan. Diperbarui setiap epic selesai.
> Terakhir: **12 Agustus 2026** — E03 selesai.

## Status Keseluruhan

| Epic | Nama | Task | Status |
|---|---|---|---|
| **E01** | Foundation & Tooling | 10/10 | ✅ **Selesai** |
| **E02** | Database & Prisma | 9/9 | ✅ **Selesai** |
| **E03** | Auth & Session | 12/12 | ✅ **Selesai** |
| E04 | Onboarding, Consent & Identity | 0/8 | ⬜ Belum |
| E05 | Post & Feed | 0/12 | ⬜ Belum |
| E06 | Interaction & Felt Heard | 0/8 | ⬜ Belum |
| E07 | Safety Engine & Moderation Core | 0/14 | ⬜ Belum |
| E08 | AI Gateway | 0/9 | ⬜ Belum |
| E09 | DONG AI | 0/8 | ⬜ Belum |
| E10 | Listener & Matching | 0/11 | ⬜ Belum |
| E11 | Private Chat Room | 0/9 | ⬜ Belum |
| E12 | Notification | 0/9 | ⬜ Belum |
| E13 | Search | 0/4 | ⬜ Belum |
| E14 | Admin Panel | 0/15 | ⬜ Belum |
| E15 | Web UI | 0/17 | ⬜ Belum |
| E16 | Mobile (Android) | 0/13 | ⬜ Belum |
| E17 | Compliance, Deploy & Observability | 0/14 | ⬜ Belum |

**Progres: 31 / 182 task (17,0%).**

---

## E03 — Auth & Session ✅

Email OTP, Google OAuth, JWT 15 menit, rotating refresh dengan reuse detection,
Turnstile, rate limit, block dua arah.

| Task | Hasil |
|---|---|
| E03-T01 | `EmailProvider` interface + Resend + console adapter |
| E03-T02 | OTP TTL 10 mnt, hash-only, rate limit, response generik |
| E03-T03 | Access token 15 mnt + guard global |
| E03-T04 | Rotating refresh + **reuse detection** cabut satu family |
| E03-T05 | Cookie HttpOnly (web) vs body (mobile) |
| E03-T06 | Google ID token diverifikasi server-side |
| E03-T07 | Turnstile, dipicu saat anomaly |
| E03-T08 | Rate limit Redis, fail-closed untuk endpoint auth |
| E03-T09 | Logout & logout-all + bersihkan push token |
| E03-T10 | `/me`, `PATCH /me`, profil publik allow-list |
| E03-T11 | Block/unblock dua arah |
| E03-T12 | Security suite 15 kasus terhadap server sungguhan |

### Hasil verifikasi

```
pnpm lint       13/13 workspace  hijau
pnpm typecheck  13/13 workspace  hijau
pnpm test       118 test         hijau
```

Pemecahan: auth 33 · api 23 · web 17 · database 14 · types 10 · config 9 ·
notifications 8 · admin 4.

### Keputusan besar: JWT ditulis sendiri di atas `node:crypto`

`jose` (dan sebagian besar library JWT yang masih dirawat) sekarang **ESM-only**,
sementara API berjalan sebagai CommonJS — NestJS butuh `emitDecoratorMetadata`
untuk DI. `require('jose')` gagal dengan `MODULE_NOT_FOUND`; ini terbukti, bukan
dugaan.

Pilihannya: mengubah seluruh backend jadi ESM, atau menulis HS256 sendiri.
HS256 itu HMAC atas dua segmen base64url — pendek dan bisa dibaca utuh.

Yang membuat verifier JWT aman bukan library-nya, tapi penolakan terhadap
serangan yang sudah dikenal. Semuanya ditangani **dan diuji**:

| Serangan | Ditolak karena |
|---|---|
| `alg: none` | algoritma di-pin server-side, tidak dibaca dari token |
| Algorithm confusion (`RS256`) | sama — token tidak boleh memilih cara dirinya diperiksa |
| Payload ditukar, signature asli | signature dihitung atas header+payload |
| Signature dipotong | perbandingan constant-time, panjang dicek |
| Token tanpa `exp` | ditolak sebagai malformed — kalau tidak, berlaku selamanya |
| `aud` / `iss` orang lain | keduanya diverifikasi |
| `iat` di masa depan | ditolak |
| Timing attack | `timingSafeEqual`, bukan `===` |

Untuk Google ID token (RS256 + JWKS + rotasi kunci) gue **tidak** menulis
sendiri — dipakai `google-auth-library` resmi dari Google, yang CommonJS.
Batasnya jelas: yang sederhana dan sepenuhnya kita kontrol ditulis sendiri, yang
melibatkan infrastruktur kunci pihak lain diserahkan ke pemiliknya.

### Reuse detection

Aturannya: tiap refresh mencetak token baru dan mencabut yang lama. Kalau token
yang **sudah dirotasi** dipakai lagi — entah bocor atau replay, dan tidak ada
cara membedakannya — **seluruh family dicabut**. Kehilangan sesi jauh lebih kecil
kerugiannya daripada membiarkan token curian tetap hidup.

Termasuk kasus balapan: dua refresh bersamaan atas token yang sama, yang kalah
diperlakukan sebagai reuse. Diuji end-to-end, bukan diasumsikan.

### Aturan yang ditegakkan, bukan sekadar didokumentasikan

- **Autentikasi menyala secara default.** Route opt-out dengan `@Public()`.
  Kebalikannya — opt-in per route — adalah cara endpoint rilis tanpa proteksi
  karena ada yang lupa satu dekorator. Diuji: `/v1/me` tanpa token → 401.
- **Access token dicek sesinya, bukan cuma signature-nya.** Tanpa itu, user yang
  sudah logout tetap punya token yang bekerja sampai 15 menit. Diuji.
- **Web tidak pernah menerima refresh token di body.** `localStorage` dilarang
  TECH-SPEC §5.1, dan browser tidak punya tempat aman lain — jadi token-nya
  ditahan, bukan dikirim lalu diharapkan disimpan dengan benar.
- **Profil publik pakai allow-list**, bukan menghapus field. Kolom baru di
  `user_profiles` tidak otomatis terlihat publik hanya karena tidak ada yang
  ingat mengecualikannya.
- **Response OTP identik** untuk email terdaftar dan tidak. Diuji dengan
  membandingkan body-nya langsung.

### Catatan

- Threshold anomaly Turnstile dipindah ke `app_configs` — nilai keamanan yang
  di-hardcode tidak bisa dinaikkan saat insiden tanpa deploy.
- Test suite membaca kode OTP dengan mem-brute-force ruang 6 digit terhadap
  hash tersimpan. Itu memang lambat (~20 detik), dan justru membuktikan properti
  yang diuji: kode plaintext-nya memang tidak ada di database.

---

## E02 — Database & Prisma ✅

Skema PostgreSQL 16 lengkap lewat Prisma ORM 7, dengan constraint yang menegakkan
aturan produk di level database.

| Task | Hasil |
|---|---|
| E02-T01 | `prisma.config.ts` + `@prisma/adapter-pg` — konvensi Prisma 7 |
| E02-T02 | Identity & auth — 9 model |
| E02-T03 | Konten — post, comment, reaction, Felt Heard, mood |
| E02-T04 | Listener & chat — 9 model termasuk counter burnout |
| E02-T05 | AI — conversation, message, classification, usage event |
| E02-T06 | Safety, moderation & **banding** |
| E02-T07 | Compliance — consent, support resource, export, retention run |
| E02-T08 | 136 index, 8 partial index, full-text search |
| E02-T09 | Seed idempoten: 15 kategori, 43 app config, 6 feature flag |

### Hasil verifikasi

```
44 tabel · 42 enum · 136 index · 53 foreign key
8 check constraint · 1 trigger

pnpm lint       8/8 workspace  hijau
pnpm typecheck  8/8 workspace  hijau
pnpm test       62 test        hijau
migrate deploy  2 migration    applied
seed 2×         hitungan tidak berubah (idempoten)
```

Pemecahan test: web 17 · database 14 · types 10 · config 9 · api 8 · admin 4.

### Aturan produk yang sekarang dijaga database, bukan cuma kode

Prisma tidak bisa mendeklarasikan CHECK constraint, jadi semuanya ditulis tangan
di migration dan **diuji benar-benar menolak**:

| Constraint | Menjaga |
|---|---|
| `moderation_appeals_reviewer_not_decider` | PRD §15.4 — moderator tidak boleh meninjau banding atas keputusannya sendiri |
| `listener_profiles_max_concurrent_range` | PRD §11.2 — listener boleh **menurunkan** batas sesi, tidak boleh menaikkan |
| `felt_heard_prompts_answer_xor_dismiss` | PRD §9 — dismiss tidak bisa tercatat sebagai "Belum" |
| `support_resources_verified_when_active` | PRD §15.2 — hotline tidak bisa tayang tanpa sumber resmi |
| `blocked_users_no_self_block` | PRD §15 |
| `listener_matches_no_self_match` | TECH-SPEC §4.5 |
| trigger `comments_single_nesting` | PRD §9 — reply ke reply ditolak |

Aturan "reviewer ≠ pemutus" melintasi dua tabel, dan CHECK constraint tidak bisa
membaca tabel lain. `decider_id` sengaja didenormalisasi ke `moderation_appeals`
supaya aturan keadilan ini jadi **jaminan database**, bukan konvensi yang service
layer dipercaya untuk mengingat.

### Keputusan yang diambil saat implementasi

1. **Full-text search pakai konfigurasi `simple`, bukan `indonesian`.**
   PostgreSQL tidak punya stemmer Bahasa Indonesia, dan `english` akan
   men-stem kata Indonesia secara keliru. `simple` menjaga token utuh; imbuhan
   ditangani prefix matching di query layer. Ini kompromi sadar — dicatat di
   migration supaya bisa ditinjau ulang kalau kualitas pencarian kurang.
2. **`packages/database` CommonJS, bukan ESM.** Client Prisma 7 yang di-generate
   adalah CJS; menandai package sebagai `type: module` membuat Node menolak
   file generated-nya (`exports is not defined`). Konsisten juga dengan API
   (NestJS CJS).
3. **`generated/` ikut dikompilasi ke `dist/`.** File-nya bertanda `@ts-nocheck`
   dari Prisma, jadi tidak mengurangi ketatnya typecheck.
4. **CI sekarang menjalankan Postgres 16 sebagai service.** Tanpa itu, 10 test
   constraint akan **ter-skip diam-diam** — dan yang mereka jaga adalah jaminan
   keselamatan, bukan detail teknis. Test yang skip tanpa suara lebih buruk
   daripada test yang tidak ada.
5. **Seed sengaja tidak menanam nomor hotline.** Seed mencetak peringatan bahwa
   layar krisis L3 kosong dan menunjuk ke E17-T12. Nomor karangan yang mati
   lebih berbahaya daripada tidak menampilkan apa pun.
6. **Seed tidak menimpa `app_configs` yang sudah ada.** Nilai-nilai itu
   dikalibrasi dari admin panel; re-seed tidak boleh diam-diam mengembalikannya.

### Catatan

- 43 `app_configs` diisi dari nilai usulan PRD §25.7 — semuanya bisa diubah
  tanpa deploy, dan masih menunggu sign-off.
- Infra dev berjalan di port khusus (Postgres `54329`, Redis `63799`) dan sudah
  diverifikasi tidak mengganggu proyek lain di VPS ini.

---

## E01 — Foundation & Tooling ✅

Monorepo, 4 app ter-scaffold, CI, dan infra dev. Semua epic lain bergantung ke sini.

| Task | Hasil |
|---|---|
| E01-T01 | Monorepo pnpm 10 + Turborepo 2, git init, catalog versi terpusat |
| E01-T02 | tsconfig base/next/nest/expo, ESLint flat config, Prettier |
| E01-T03 | `packages/config` — env schema Zod, server vs client dipisah |
| E01-T04 | `packages/types` — enum domain, API envelope, event SSE/WS |
| E01-T05 | `apps/api` NestJS 11, 18 module (termasuk `profiles`) |
| E01-T06 | `apps/web` Next 16.3 + Tailwind 4 + design token 3 tema |
| E01-T07 | `apps/admin` Next 16.3 + sidebar 13 menu |
| E01-T08 | `docker-compose.dev.yml` Postgres 16 + Redis 7 |
| E01-T09 | GitHub Actions: lint → typecheck → test + 2 policy guard |
| E01-T10 | Common layer API: envelope, ErrorCode stabil, Zod pipe, health |

### Hasil verifikasi

```
pnpm lint       7/7 workspace   hijau
pnpm typecheck  7/7 workspace   hijau
pnpm test       48 test         hijau
next build      web + admin     sukses
```

Pemecahan test: `@curhat/web` 17 · `@curhat/types` 10 · `@curhat/config` 9 · `@curhat/api` 8 · `@curhat/admin` 4.

API diuji hidup:

| Endpoint | Hasil |
|---|---|
| `GET /v1/health/live` | `200` — `{"data":{"status":"ok"},"meta":{},"error":null}` |
| `GET /v1/health/ready` | `503` saat Postgres+Redis mati, dengan detail per dependency |
| `GET /v1/tidak-ada` | `404` — envelope dengan `code: NOT_FOUND` |
| Security header | CSP, HSTS, X-Content-Type-Options, X-Frame-Options aktif |

### Versi ter-pin (catalog `pnpm-workspace.yaml`)

Next 16.3.0 · React 19.2.8 · NestJS 11.1.29 · Prisma 7.9.1 · Tailwind 4.3.3 ·
TypeScript 5.9.3 · Zod 4.4.3 · pnpm 10.30.0 · Node 20.20.0.

Semua sesuai stack LOCKED di `CLAUDE.md`. Tidak ada `"latest"` di mana pun —
dijaga guard CI, bukan cuma niat baik.

### Aturan non-negotiable yang sudah punya penegakan

| # | Aturan | Penegakan |
|---|---|---|
| 3 | Push & Sentry tanpa isi curhat | `NOTIFICATION_TEMPLATES` = set tertutup; `NotificationPayload` sengaja **tidak punya** field `body`. Exception filter hanya mencatat method+path. |
| 4 | API publik tanpa PII | Env server vs client dipisah skema; ESLint memblokir import env server dari bundle Next; test memastikan kedua skema tidak punya key beririsan |
| 5 | Semua halaman curhat noindex | `X-Robots-Tag: noindex, nofollow` di seluruh route web & admin + metadata `robots` |
| 6 | Dilarang `"latest"` | Catalog terpusat + guard CI yang gagal kalau ada versi mengambang |

Empat sisanya (#1 safety fallback, #2 L3 no auto-punish, #7 migration review,
#8 tone Indonesia) ditegakkan di E07, E17, dan E15.

### Keputusan yang diambil saat implementasi

1. **Shared package di-build ke CJS `dist/`.** NestJS (CJS) tidak bisa
   me-resolve `exports` yang menunjuk ke `.ts`. Alternatifnya `paths` mapping,
   tapi itu cuma menipu type checker — runtime tetap gagal. `apps/api` pakai
   `moduleResolution: Node16` agar `exports` terbaca.
2. **Global `ValidationPipe` NestJS dibuang.** `CLAUDE.md` menetapkan Zod di
   boundary; memasang dua stack validasi berarti dua sumber kebenaran yang bisa
   berbeda pendapat soal request yang sama. Yang dipakai `ZodValidationPipe`.
3. **`consistent-type-imports` dimatikan khusus `apps/api`.** NestJS resolve DI
   dari metadata `design:paramtypes`, yang cuma ada untuk *value* import.
   Mengubah class ter-inject jadi `import type` menghapus metadata itu dan
   provider gagal resolve **saat runtime** — kegagalan yang tidak terlihat oleh
   type checker. Ini jebakan halus; makanya rule-nya dimatikan dengan alasan
   tertulis, bukan di-`--fix` diam-diam.
4. **Kontras warna diuji di CI, bukan dilihat mata.** Aksen hangat di atas dasar
   gelap gampang gagal AA. `apps/web/lib/contrast.test.ts` menghitung rasio
   untuk 3 tema × 5 pasangan; build gagal kalau ada token melenceng.
5. **`.env` dicari ke atas dari cwd.** API biasanya dijalankan dari `apps/api`
   sementara `.env` ada di root monorepo.

### Alokasi port — VPS ini dipakai bersama proyek lain

Survei 12 Agustus 2026 menemukan **dua bentrokan nyata** dengan konfigurasi awal:

| Port | Sudah dipakai oleh | Akibatnya |
|---|---|---|
| `6379` | `redis-server` sistem (jalan sejak 18 Juli) | Redis compose gagal bind |
| `3000` | `next-server` proyek lain | `apps/web` merebut port proyek orang |

Seluruh port CURHAT DONG dipindah ke blok sendiri:

| Service | Port | Sebelumnya |
|---|---|---|
| Web | `3100` | ~~3000~~ |
| API | `3101` | ~~3001~~ |
| Admin | `3102` | ~~3002~~ |
| PostgreSQL | `54329` | ~~5432~~ |
| Redis | `63799` | ~~6379~~ |

Postgres & Redis tetap di-bind `127.0.0.1` saja (TECH-SPEC §7.1).

**Redis sistem sengaja tidak ditumpangi** meski secara teknis bisa pakai nomor DB
berbeda: satu `FLUSHALL` dari proyek mana pun akan menghapus antrian BullMQ kita,
dan keyspace-nya saling terlihat. Detail di `infrastructure/PORTS.md`.

`pnpm infra:check` menolak menyalakan container kalau ada port terpakai —
sudah diuji: benar mendeteksi `6379` dan `3000` sebagai bentrok lalu keluar
dengan exit 1.

### Catatan & keterbatasan

- **Docker 29.7.2 terpasang** (oleh user — `sudo` butuh password). Container
  `curhat-postgres-dev` dan `curhat-redis-dev` sudah jalan dan healthy.
  `/v1/health/ready` yang tadinya 503 sekarang **200** dengan Postgres 64ms dan
  Redis 28ms — kriteria E01 terakhir tertutup.
- `.env` lokal berisi nilai dev dummy — **bukan** kredensial asli, dan tidak
  ter-track git.
- Halaman `/` di web sekarang halaman token sementara; diganti landing page
  asli di E15-T05.

---

## Blocker rilis (di luar coding)

Tiga hal ini menahan go-live dan tidak bisa diselesaikan dengan menulis kode:

1. **Daftar hotline Indonesia terverifikasi** (E17-T12, PRD §15.2) — tanpa ini
   layar krisis L3 kosong. Nomor yang salah lebih berbahaya daripada tidak
   menampilkan apa pun.
2. **Pendaftaran PSE** (E17-T11, PRD §25.1) — prosedur wajib diverifikasi ke
   sumber resmi terkini; nama kementerian sudah berubah.
3. **Rotasi moderator malam** (PRD §15.3) — SLA Critical 30 menit di jam
   21.00–04.00 hanya bisa ditepati kalau ada orangnya.

Plus: naskah Privacy Policy / ToS / Community Guidelines (butuh review hukum),
dan sign-off 13 nilai usulan di PRD §25.7.

---

## Langkah Berikutnya

**E04 — Onboarding, Consent & Identity** (8 task): age gate 18+, consent 3 jenis
tercatat terpisah, alias anonim, anonymous identity per post, data export,
delete/anonymize account.

Urutan setelahnya mengikuti jalur kritis:
`E04 → E05 → E07 → E10 → E11`.

Catatan urutan: **E07 (Safety) wajib selesai sebelum E09 (DONG AI) dirilis** —
AI yang jalan tanpa safety engine melanggar aturan non-negotiable #1.
