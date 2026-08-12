---
id: E14-T13
epic: E14
title: Support Resources management
status: done
estimate: 1d
depends_on: [E14-T02, E02-T07]
refs: [PRD §15.2, TECH-SPEC §18.5, DESIGN-REF §3.14]
---

## Scope
CRUD hotline per region + kolom `verified_at` + preview seperti tampilan user.

## Acceptance criteria
- `source_url` **wajib** saat membuat/memverifikasi.
- Entri kedaluwarsa (>3 bulan) ditandai merah dan **otomatis tidak tampil ke user**.
- Preview persis seperti layar krisis — supaya kesalahan ketahuan sebelum tayang.
- Empty state adalah **peringatan keras**, bukan state netral.

## Verifikasi
Test: entri tanpa `source_url` ditolak; entri kedaluwarsa hilang dari endpoint user.
