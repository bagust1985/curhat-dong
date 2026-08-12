---
id: E16-T09
epic: E16
title: expo-notifications + registrasi push
status: todo
estimate: 1.5d
depends_on: [E16-T03, E12-T02]
refs: [TECH-SPEC §6.1, §6.2]
---

## Scope
Minta permission, ambil ExpoPushToken, daftarkan ke `/devices`, tangani tap notifikasi → deep link.

## Acceptance criteria
- Permission diminta pada momen yang masuk akal, bukan saat pertama buka app.
- Token diperbarui saat berubah.
- **Notifikasi tidak pernah memuat isi curhat/chat** — privasi lock screen adalah requirement default (non-negotiable #3).
- Quiet hours mengikuti timezone device.

## Verifikasi
Uji di device fisik: notifikasi di lock screen hanya menampilkan template generik.
