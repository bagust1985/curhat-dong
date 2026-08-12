---
id: E13-T02
epic: E13
title: Endpoint GET /search
status: done
estimate: 1d
depends_on: [E13-T01]
refs: [TECH-SPEC §3.2, DESIGN-REF §2.13]
---

## Scope
Tabs hasil: Curhat / Listener / Topik; cursor pagination.

## Acceptance criteria
- Menyaring konten dari user yang saling blokir.
- Rate limit untuk mencegah scraping.
- Hasil listener hanya menampilkan profil public-safe.

## Verifikasi
Test: hasil tidak memuat post user yang diblokir; test rate limit.
