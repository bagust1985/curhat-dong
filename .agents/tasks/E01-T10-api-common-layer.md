---
id: E01-T10
epic: E01
title: API common layer — envelope, error code, validasi, health
status: done
estimate: 1d
depends_on: [E01-T05]
refs: [TECH-SPEC §3, TECH-SPEC §10.2, CLAUDE.md konvensi]
---

## Scope
- Interceptor response `{ data, meta, error }`.
- Exception filter → error punya `code` stabil, bukan cuma message.
- ZodValidationPipe di boundary API.
- `/health/live` dan `/health/ready` (ready mengecek Postgres + Redis).

## Acceptance criteria
- Semua response sukses & error memakai envelope yang sama.
- Error tak terduga tidak membocorkan stack trace ke client.
- `/health/ready` merah kalau dependency mati.

## Verifikasi
Unit test filter+interceptor; matikan Redis → `/health/ready` 503, `/health/live` tetap 200.
