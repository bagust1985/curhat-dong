---
id: E15-T16
epic: E15
title: Profil & Settings (termasuk Data & Privasi, Banding)
status: todo
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
