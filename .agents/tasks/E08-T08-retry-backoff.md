---
id: E08-T08
epic: E08
title: Retry, backoff & fallback provider
status: todo
estimate: 1d
depends_on: [E08-T02]
refs: [TECH-SPEC §4.2, §4.4]
---

## Scope
Exponential backoff, circuit breaker per provider, fallback ke provider cadangan.

## Acceptance criteria
- Retry tidak menggandakan biaya tanpa batas (batas percobaan jelas).
- `fallback_used` tercatat di usage event.
- Habis retry → kembalikan sinyal timeout yang bisa dipakai E07-T05 untuk memutuskan publish vs HOLD.

## Verifikasi
Test dengan provider yang disimulasikan gagal; pastikan circuit breaker membuka & menutup.
