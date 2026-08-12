---
id: E17-T08
epic: E17
title: Job retensi data
status: todo
estimate: 1.5d
depends_on: [E02-T07]
refs: [PRD §25.4, TECH-SPEC §18.2]
---

## Scope
8 job retensi (posts, room messages, ai messages, safety, moderation, otp, sessions, devices) + catatan `retention_runs`.

## Acceptance criteria
- Batched, tidak mengunci tabel.
- **Tidak pernah menghapus baris yang terikat `moderation_cases` terbuka.**
- `deleted_count` nol terus-menerus dianggap sinyal job rusak, bukan sinyal aman — alert kalau terjadi.
- Nilai retensi dari config, sesuai tabel PRD §25.4.

## Verifikasi
Uji dengan data lama buatan; verifikasi hanya baris kedaluwarsa yang terhapus.
