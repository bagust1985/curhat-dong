---
id: E03-T08
epic: E03
title: Distributed rate limit (Redis)
status: done
estimate: 1d
depends_on: [E01-T08, E03-T03]
refs: [TECH-SPEC §4.7, §7.3, CLAUDE.md test minimal]
---

## Scope
- Guard rate limit berbasis Redis counter: per IP, per user, per email-hash.
- Default: post 10/hari, comment 60/jam, report 20/hari, AI 50 pesan/hari, OTP 5/jam.

## Acceptance criteria
- Nilai limit dari `app_configs` (bisa diubah tanpa deploy), bukan hardcode.
- Response 429 memakai `code` stabil + `Retry-After`.
- Redis mati → **fail closed untuk endpoint sensitif** (OTP, auth), bukan membuka pintu.

## Verifikasi
Unit test limiter (wajib, CLAUDE.md); test perilaku saat Redis mati.
