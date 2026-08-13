---
id: E17-T08
epic: E17
title: Job retensi data
status: in_progress
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
