---
id: E13-T01
epic: E13
title: tsvector + GIN index untuk post
status: todo
estimate: 1d
depends_on: [E02-T08]
refs: [TECH-SPEC §2.4]
---

## Scope
Kolom `tsvector` (title + body), trigger pembaruan, GIN index, konfigurasi bahasa Indonesia.

## Acceptance criteria
- Hanya post `published` yang terindeks — post `held`/`removed` tidak boleh muncul di pencarian.
- Index diperbarui saat post berubah status.
- Menangani kata berimbuhan Indonesia dengan wajar.

## Verifikasi
Test: post held tidak ditemukan; cari "kesepian" menemukan "kesepiannya".
