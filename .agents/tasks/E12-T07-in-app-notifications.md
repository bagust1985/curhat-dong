---
id: E12-T07
epic: E12
title: Notifikasi in-app + deep link
status: todo
estimate: 1d
depends_on: [E12-T06]
refs: [TECH-SPEC §3.4, DESIGN-REF §2.14]
---

## Scope
`GET /notifications?cursor=`, tandai dibaca, deep link ke target.

## Acceptance criteria
- Daftar in-app juga memakai template generik (PRD §14) — konsisten dengan push.
- Cursor pagination; unread count efisien.
- Deep link menangani target yang sudah dihapus dengan anggun.

## Verifikasi
Test: buka notifikasi ke post yang sudah dihapus → pesan ramah, bukan crash.
