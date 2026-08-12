---
id: E12-T01
epic: E12
title: Registrasi device (provider-agnostic)
status: todo
estimate: 1d
depends_on: [E02-T02]
refs: [TECH-SPEC §6.1, §3.4]
---

## Scope
`POST /devices`, `DELETE /devices/:id` dengan `push_provider`, `push_token_encrypted`, `platform`, `device_id`, `last_seen`.

## Acceptance criteria
- **Tidak ada field bernama `fcm_token`** (TECH-SPEC §6.1) — provider bisa diganti tanpa migration besar.
- Token disimpan terenkripsi.
- Registrasi ulang token yang sama tidak menduplikasi baris.

## Verifikasi
Test: daftarkan token expo lalu webpush untuk user sama → dua baris, provider benar.
