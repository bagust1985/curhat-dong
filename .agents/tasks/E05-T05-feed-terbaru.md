---
id: E05-T05
epic: E05
title: Feed tab "Terbaru" (cursor)
status: todo
estimate: 1d
depends_on: [E05-T03]
refs: [TECH-SPEC §3.2, §8.2, PRD §6]
---

## Scope
`GET /feed?tab=terbaru&cursor=` — hanya `published`, urut terbaru.

## Acceptance criteria
- **Cursor pagination**, bukan offset (TECH-SPEC §8.2).
- Menyaring post dari user yang diblokir dua arah.
- Cursor stabil saat ada post baru masuk (tidak ada duplikat/lompatan).

## Verifikasi
Test paginasi dengan penyisipan post di tengah iterasi.
