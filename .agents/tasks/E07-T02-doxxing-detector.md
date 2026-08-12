---
id: E07-T02
epic: E07
title: Deteksi doxxing / data pribadi
status: todo
estimate: 1d
depends_on: [E07-T01]
refs: [PRD §15, DESIGN-REF §2.6]
---

## Scope
Deteksi nomor telepon, NIK, email, nomor rekening, alamat, lokasi persis — pada post & komentar.

## Acceptance criteria
- Peringatan **pre-submit**, bukan blokir: "Sepertinya curhatanmu berisi informasi pribadi. Kamu yakin ingin membagikannya?"
- User tetap boleh melanjutkan — ini perlindungan, bukan sensor.
- Pola disesuaikan format Indonesia (NIK 16 digit, format nomor HP lokal).

## Verifikasi
Unit test tiap jenis pola + kasus negatif (angka biasa jangan ikut kena).
