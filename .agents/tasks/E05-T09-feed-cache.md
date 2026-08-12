---
id: E05-T09
epic: E05
title: Cache halaman pertama feed
status: todo
estimate: 1d
depends_on: [E05-T07]
refs: [TECH-SPEC §8.1, §8.3]
---

## Scope
Cache Redis untuk halaman pertama feed, TTL 30–60 detik.

## Acceptance criteria
- **Jangan cache response personal secara global** (TECH-SPEC §8.1) — "Untuk Kamu" tidak boleh bocor antar user.
- Cache key memasukkan konteks blokir/user bila relevan.
- Post baru muncul dalam ≤ TTL.
- **Redis bukan source of truth** — cache miss harus tetap benar (non-negotiable #5).

## Verifikasi
Test: user A dan B tidak pernah menerima cache satu sama lain untuk tab personal.
