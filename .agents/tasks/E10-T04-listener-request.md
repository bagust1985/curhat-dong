---
id: E10-T04
epic: E10
title: Request listener
status: todo
estimate: 1d
depends_on: [E10-T03]
refs: [TECH-SPEC §3.4, §4.5, DESIGN-REF §2.10]
---

## Scope
`POST /listener/requests` — topik + apa yang dirasakan, prefill dari post/AI. Entry: AI bridge, create curhat, tombol Home.

## Acceptance criteria
- Satu request aktif per user pada satu waktu.
- Request menyertakan topik & emosi **tanpa** identitas requester.
- Rate limit untuk mencegah penyalahgunaan.

## Verifikasi
Test: request kedua saat masih aktif → ditolak dengan pesan jelas.
