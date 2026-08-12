---
id: E04-T07
epic: E04
title: Data export (hak portabilitas)
status: todo
estimate: 1d
depends_on: [E02-T07]
refs: [PRD §25.2, TECH-SPEC §18.3]
---

## Scope
- `POST /me/export` → job async → `GET /me/export/:id` (signed URL, kedaluwarsa).
- Format JSON terstruktur.

## Acceptance criteria
- Berisi data milik user sendiri saja — **bukan** pesan lawan bicara di private room.
- Signed URL kedaluwarsa dan tidak bisa ditebak.
- Rate limit permintaan export.

## Verifikasi
Test: export user A tidak memuat konten user B; URL kedaluwarsa → 403.
