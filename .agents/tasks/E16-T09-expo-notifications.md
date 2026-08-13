---
id: E16-T09
epic: E16
title: expo-notifications + registrasi push
status: done
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

## Catatan implementasi

- **Permission tidak pernah diminta saat launch.** `shouldAskForPermission`
  memutuskan, dan hanya mengizinkan tiga momen: setelah post pertama, setelah
  aktivasi listener, setelah minta listener. Di Android, POST_NOTIFICATIONS yang
  ditolak **tidak bisa diminta lagi** — prompt yang terlalu dini itu permanen.
- Tap notifikasi ditangani **dua jalur**: `launchNotification()` untuk cold start
  (tap yang menyalakan proses datang sebelum listener terpasang) dan listener
  untuk app yang sudah jalan. Keduanya lewat `resolveDeepLink` allow-list.
- Token yang berotasi memicu registrasi ulang; tanpa itu akun terus dipush ke
  token yang tidak ada yang dengar.
- Privasi lock screen dijaga dua lapis: server memang tidak punya field teks
  bebas, dan klien **membuang `body`** kalau payload membawa field yang
  mencurigakan (`excerpt`, `content`, `preview`, …). Diuji.
- `deviceId` dibuat sekali dan disimpan — API upsert di `(userId, deviceId)`,
  jadi id baru tiap launch meninggalkan baris device mati.
- **Belum diuji di perangkat**: tampilan lock screen, quiet hours dari timezone
  device, dan offer via push saat app tertutup.
