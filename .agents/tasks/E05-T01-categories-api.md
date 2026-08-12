---
id: E05-T01
epic: E05
title: Categories API + cache
status: done
estimate: 0.5d
depends_on: [E02-T09]
refs: [TECH-SPEC §3.2, §8.1]
---

## Scope
`GET /categories` dengan cache Redis; hanya kategori aktif, urut `display_order`.

## Acceptance criteria
- Cache invalid saat admin mengubah kategori — jangan tunggu TTL.
- Response ringan (dipakai di banyak layar).

## Verifikasi
Integration: ubah kategori di admin → `GET /categories` langsung berubah.
