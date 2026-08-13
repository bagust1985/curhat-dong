---
id: E17-T05
epic: E17
title: Sentry + scrubbing data sensitif
status: in_progress
estimate: 1.5d
depends_on: [E01-T09]
refs: [TECH-SPEC §10.1, CLAUDE.md non-negotiable #3]
---

## Scope
Sentry di web, admin, mobile, api, worker + aturan scrubbing.

## Acceptance criteria
- Scrub: Authorization, Cookie, email, chat content, post body, AI conversation content, push token.
- **Isi curhat tidak pernah dikirim ke Sentry** (non-negotiable #3) — termasuk lewat breadcrumb, request body, dan pesan error.
- Scrubbing diverifikasi dengan error sungguhan, bukan diasumsikan dari config.

## Verifikasi
**Test wajib**: picu error saat membuat post → cek event Sentry tidak memuat body post. Ini menjaga non-negotiable #3.

## Catatan implementasi (sebagian)

- Paket baru `@curhat/observability` berisi aturan scrubbing sebagai fungsi murni,
  **tanpa dependency ke SDK Sentry**, supaya bisa diuji dengan event sungguhan.
- Scrubbing berdasarkan **bentuk, bukan nama field**: body request di rute konten
  (`/v1/posts`, `/v1/rooms`, `/v1/ai`, …) dibuang seluruhnya, apa pun nama
  fieldnya bulan ini.
- **Lubang yang ditemukan test sendiri:** pesan exception yang menginterpolasi
  isi yang sedang divalidasi (`body gagal divalidasi: "..."`) lolos dari semua
  aturan berbasis key. Ditambahkan aturan quoted-run (≥24 karakter) — alasannya
  tetap terbaca, isinya tidak.
- Query string dipertahankan **nama parameternya saja**, diambil dari
  `query_string` maupun dari URL, karena SDK berbeda menaruhnya di tempat berbeda.
- `user` disisakan `id` saja.

## Yang belum

- **Belum dipasang ke aplikasi mana pun.** Wiring `beforeSend` di api, worker,
  web, admin, dan mobile belum dikerjakan, dan verifikasi "picu error sungguhan
  lalu cek event di dashboard Sentry" belum bisa dilakukan tanpa DSN.
