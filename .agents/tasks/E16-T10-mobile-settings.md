---
id: E16-T10
epic: E16
title: Profil, Settings & Data (mobile)
status: done
estimate: 1.5d
depends_on: [E16-T05, E04-T08]
refs: [DESIGN-REF §2.15, §2.16, §2.21]
---

## Scope
Profil, settings (akun/notifikasi/privasi/tema), data & privasi (consent, export, delete), banding.

## Acceptance criteria
- Parity dengan web untuk seluruh fungsi privasi.
- Delete account menampilkan konsekuensi yang sama persis dengan web.
- Tema dark/light/system.

## Verifikasi
Uji alur delete & banding di device.

## Catatan implementasi

- Konsekuensi hapus akun diambil dari `/me/deletion-consequences`, sama persis
  dengan web.
- Konfirmasi ketik `HAPUS AKUN` dipertahankan di mobile.
- Notifikasi `safety` dan `account` tidak punya toggle.
- **Alur delete & banding belum diuji di perangkat.**
