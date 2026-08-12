---
id: E14-T04
epic: E14
title: Akses konten privat — hanya via case + banner audit
status: todo
estimate: 1d
depends_on: [E14-T03]
refs: [PRD §15, §25.6, DESIGN-REF §3.4]
---

## Scope
Gerbang akses: butuh case aktif, dialog konfirmasi, banner "akses ini dicatat".

## Acceptance criteria
- **Tanpa case aktif → tidak ada akses**, ditegakkan API.
- Admin melihat banner sebelum konten terbuka, bukan sesudah.
- Akses tanpa case tidak mungkin dilakukan lewat jalur mana pun (termasuk endpoint lain).

## Verifikasi
Test: akses tanpa case → 403 + percobaan tercatat.
