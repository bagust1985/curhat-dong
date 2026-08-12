---
id: E03-T09
epic: E03
title: Logout, logout-all & manajemen sesi
status: todo
estimate: 0.5d
depends_on: [E03-T04]
refs: [TECH-SPEC §3.1, DESIGN-REF §2.16]
---

## Scope
- `POST /auth/logout` (sesi saat ini), `POST /auth/logout-all` (semua family).
- Bersihkan push token device terkait.

## Acceptance criteria
- `logout-all` mencabut seluruh sesi termasuk device lain, seketika.
- Token yang sudah dicabut ditolak walaupun belum kedaluwarsa.

## Verifikasi
Integration: login di 2 device → logout-all → keduanya 401.
