---
id: E09-T01
epic: E09
title: Conversation CRUD + riwayat
status: todo
estimate: 1d
depends_on: [E08-T03]
refs: [TECH-SPEC §3.3, DESIGN-REF §2.8a]
---

## Scope
`GET/POST /ai/conversations`, `GET /ai/conversations/:id/messages` (cursor).

## Acceptance criteria
- Percakapan terisolasi per user — kebocoran di sini adalah pelanggaran privasi paling berat di produk ini.
- Judul percakapan dibuat otomatis tanpa mengekspos isi sensitif.
- Riwayat memakai cursor pagination.

## Verifikasi
Test otorisasi: user B tidak bisa mengakses percakapan user A dengan cara apa pun.
