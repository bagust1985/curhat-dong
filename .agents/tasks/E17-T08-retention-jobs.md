---
id: E17-T08
epic: E17
title: Job retensi data
status: done
estimate: 1.5d
depends_on: [E02-T07]
refs: [PRD §25.4, TECH-SPEC §18.2]
---

## Scope
8 job retensi (posts, room messages, ai messages, safety, moderation, otp, sessions, devices) + catatan `retention_runs`.

## Acceptance criteria
- Batched, tidak mengunci tabel.
- **Tidak pernah menghapus baris yang terikat `moderation_cases` terbuka.**
- `deleted_count` nol terus-menerus dianggap sinyal job rusak, bukan sinyal aman — alert kalau terjadi.
- Nilai retensi dari config, sesuai tabel PRD §25.4.

## Verifikasi
Uji dengan data lama buatan; verifikasi hanya baris kedaluwarsa yang terhapus.

## Catatan implementasi

- **Worker dibuat sebagai entrypoint kedua `apps/api` (`src/worker/`), bukan
  `apps/worker`.** CLAUDE.md meminta worker terpisah — terpisah **prosesnya**:
  container sendiri, perintah sendiri (`start:worker`), restart policy sendiri.
  Tapi tiap job memanggil service yang sudah dimiliki API (`deliverDue`,
  `expireOverdue`, `closeIdleRooms`, `computeDay`), dan service itulah yang
  memegang aturannya. Paket terpisah harus mengimpor lintas app atau
  mengimplementasi ulang — dan implementasi kedua dari "kapan notifikasi boleh
  dikirim" persis cara quiet hours dihormati di satu jalur dan tidak di jalur lain.
- Delete di-batch 500 baris, maksimal 40 batch per run. Satu `DELETE` atas
  setahun pesan room mengunci cukup lama untuk membuat app tersendat — dan app
  itu tempat orang lagi setengah kalimat.
- Guard `NOT EXISTS` terhadap `moderation_cases` yang masih terbuka. Moderator
  yang memutuskan sesuatu yang sudah tidak bisa dia baca lebih buruk daripada
  baris yang lewat tanggal.
- **`deleted_count` nol berturut-turut = sinyal rusak, bukan sinyal aman.**
  `looksStuck` mengalert setelah 7 run selesai tanpa menghapus apa pun, dan
  sengaja **tidak** menghitung run yang gagal — itu sudah alert sendiri.
- Job "broadcast terjadwal" **sengaja tidak didaftarkan**: `BroadcastService`
  belum punya dispatcher-nya (utang E14). Entri cron yang menunjuk method tidak
  ada bikin fiturnya terlihat jalan.

## Yang belum

- Verifikasi "uji dengan data lama buatan, pastikan hanya baris kedaluwarsa yang
  terhapus" **belum dijalankan** — butuh seed data lama di database. Yang sudah
  diuji: seluruh aritmetika cutoff, guard open-case per job, dan aturan alert
  zero-delete (11 test).

## Verifikasi atas data sungguhan (penutup)

`retention.db.test.ts` menjalankan SQL-nya terhadap Postgres beneran dengan data
yang di-seed. **Dan itu menemukan bug asli:** `entity` di plan memakai nama
model Prisma, bukan nama tabel fisiknya. `posts` sebenarnya `curhat_posts`,
`room_messages` sebenarnya `messages`, dan `safety_analyses` sebenarnya
`safety_events` — ketiganya `@@map`. Seluruh unit test lolos dengan nama yang
salah itu, karena aritmetika cutoff tidak pernah menyentuh database. Di produksi
job-nya bakal gagal tiap malam dengan `relation ... does not exist`, dan
`deleted_count` tetap 0 — persis pola yang `looksStuck` anggap "rusak", tapi baru
ketahuan setelah 7 hari.

Yang diuji sekarang (24 test di `src/worker`):

- OTP kedaluwarsa terhapus, OTP segar **tidak**;
- baris tepat di batas jendela **tidak** terhapus (`<`, bukan `<=`) — umur yang
  sama persis dengan periode retensi belum melewatinya;
- sapuan kedua atas tabel bersih mengembalikan 0 (nol sekali itu benar; nol tujuh
  hari berturut-turut yang jadi alarm);
- query guard open-case **valid secara SQL** terhadap skema sungguhan — guard
  yang tidak valid akan diam-diam tidak cocok apa pun lalu menghapus semuanya.
