---
id: E05-T08
epic: E05
title: Feed per topik + halaman Explore
status: done
estimate: 0.5d
depends_on: [E05-T05]
refs: [PRD §6, DESIGN-REF §2.12]
---

## Scope
`GET /feed?tab=topik&category=` + daftar kategori dengan jumlah curhat aktif.

## Acceptance criteria
- Hitungan curhat aktif di-cache, bukan `COUNT(*)` tiap request.
- Kategori kosong tetap tampil dengan empty state hangat.

## Verifikasi
Test filter kategori; ukur waktu response halaman Explore.
