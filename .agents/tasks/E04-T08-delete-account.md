---
id: E04-T08
epic: E04
title: Delete account — purge vs anonymize
status: done
estimate: 1.5d
depends_on: [E04-T07]
refs: [PRD §25.4, TECH-SPEC §18.3, DESIGN-REF §2.21]
---

## Scope
`DELETE /me { mode: 'purge' | 'anonymize' }` — cabut sesi, hapus push token, matikan listener, batalkan match terbuka.

## Acceptance criteria
- `purge`: grace 30 hari sebelum konten benar-benar dihapus.
- `anonymize`: **irreversible**, kaitan author diputus; UI wajib menyatakan konsekuensi ini sebelum konfirmasi.
- Pesan private room **tidak** hilang dari sisi lawan bicara sebelum retensi habis — dijelaskan ke user, bukan disembunyikan.
- `audit_logs` & `moderation_*` tetap ada sesuai masa retensi.
- Jangan pernah menjanjikan "terhapus seketika dari semua sistem" — backup baru rotasi 30 hari.

## Verifikasi
Test kedua mode; pastikan sesi tercabut seketika dan konten lawan bicara utuh.
