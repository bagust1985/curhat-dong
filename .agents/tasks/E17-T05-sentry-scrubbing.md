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

## Wiring (lanjutan)

Terpasang di **lima** entrypoint, semuanya lewat `sentryOptions()` yang sama:

| App | Entrypoint |
|---|---|
| api | `src/observability/sentry.ts`, dipanggil di `main.ts` **sebelum import lain** |
| worker | init yang sama, tag `process: worker` — biar crash jam 03.00 bisa dibedakan |
| web | `instrumentation.ts` (server) + `instrumentation-client.ts` (browser) |
| admin | idem |
| mobile | `lib/sentry.ts`, dipanggil sebelum render pertama |

- **Opsi datang dari satu fungsi bersama**, bukan config per app. Lupa memasang
  `beforeSend` di salah satu dari lima tempat itu persis kesalahan yang berakhir
  dengan curhat di dashboard pihak ketiga, dan tidak akan kelihatan sampai
  kejadian.
- **Breadcrumb `console` dibuang seluruhnya**, bukan disaring: isinya apa pun
  yang dilempar orang ke `console.log`, dan di produk ini itu pernah body post.
- **Session Replay dan screenshot sengaja tidak diaktifkan** di web maupun
  mobile — keduanya merekam layar, dan di sini layar itu curhat seseorang.
- `sendDefaultPii: false` di semua app.
- Tanpa DSN, SDK `enabled: false` — bukan client yang diam-diam membuang semua
  event sambil terlihat terkonfigurasi.
- `EXPO_PUBLIC_SENTRY_DSN` **tidak** dimasukkan ke `clientEnvSchema`: skema itu
  khusus permukaan Next (`NEXT_PUBLIC_*`) dan ada test yang menjaganya. Mobile
  membaca env-nya langsung, sama seperti `EXPO_PUBLIC_API_URL`.

**Yang masih belum:** memicu error sungguhan terhadap DSN produksi lalu memeriksa
event-nya di dashboard. Itu satu-satunya bagian AC yang belum tertutup.
