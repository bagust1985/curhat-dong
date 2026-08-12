---
id: E08-T07
epic: E08
title: Kuota AI harian per user
status: todo
estimate: 0.5d
depends_on: [E08-T06]
refs: [TECH-SPEC §4.7, DESIGN-REF §2.8c]
---

## Scope
50 pesan/hari/user (25 saat degradasi), counter Redis, reset harian.

## Acceptance criteria
- Kuota habis → copy hangat + **CTA Cari Listener**, bukan error mentah: "Kuota harian habis — besok kita lanjut ya."
- Indikator sisa kuota tersedia untuk UI.
- Nilai dari `app_configs`.

## Verifikasi
Test batas kuota + reset lintas hari (perhatikan timezone).
