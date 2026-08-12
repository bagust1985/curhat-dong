---
id: E10-T03
epic: E10
title: Availability toggle + mirror Redis
status: done
estimate: 1d
depends_on: [E10-T02]
refs: [TECH-SPEC §1.6, §4.5, §8.1]
---

## Scope
`PUT /listener/availability`; Postgres sebagai source of truth, Redis set untuk kandidat cepat.

## Acceptance criteria
- **Redis bukan source of truth** (non-negotiable #5) — kalau Redis hilang, state bisa dibangun ulang dari Postgres.
- Listener bisa set unavailable kapan saja, **termasuk saat ada offer masuk**.
- Disconnect/idle memperbarui availability.

## Verifikasi
Test: kosongkan Redis → rebuild dari Postgres → matching tetap benar.
