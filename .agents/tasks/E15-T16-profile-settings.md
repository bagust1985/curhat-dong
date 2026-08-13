---
id: E15-T16
epic: E15
title: Profil & Settings (termasuk Data & Privasi, Banding)
status: done
estimate: 2d
depends_on: [E15-T02, E04-T08, E07-T11]
refs: [DESIGN-REF §2.15, §2.16, §2.19, §2.21]
---

## Scope
Profil publik & sendiri; Settings (akun, notifikasi + quiet hours, privasi, tema); `/settings/data` (consent, export, delete); `/moderation/actions` + form banding.

## Acceptance criteria
- Profil publik tanpa email/phone/identitas/followers.
- Delete account: konsekuensi `anonymize` **irreversible** dinyatakan sebelum konfirmasi; jelaskan pesan room milik lawan bicara & backup 30 hari.
- Banding: state lengkap (bisa banding / window habis / sudah pernah / menunggu / hasil).
- Consent analitik bisa dimatikan dengan penegasan semua fitur tetap jalan.

## Verifikasi
Uji alur delete kedua mode dan alur banding penuh.

## Catatan implementasi

- Konsekuensi hapus akun **diambil dari server** (`/me/deletion-consequences`),
  bukan disalin ke klien: dua hal yang paling bikin kaget — pesan di ruang orang
  lain tidak ikut terhapus, dan cadangan baru hilang 30 hari — jadi selalu sama
  dengan yang benar-benar dilakukan backend.
- `anonymize` dinyatakan **tidak bisa dibatalkan sebelum** dialog konfirmasi
  muncul, bukan di dalamnya.
- Toggle notifikasi mengirim **hanya tipe yang berubah**; mengirim seluruh set
  balik adalah cara layar basi diam-diam mengembalikan setelan yang baru diubah
  di perangkat lain.
- Notifikasi `safety` dan `account` tidak bisa dimatikan — itu jalur satu-satunya
  buat memberi tahu post ditahan, banding diputus, atau akun berisiko.
- Halaman banding punya lima state lengkap dan **tidak pernah menyebut
  moderatornya**.
