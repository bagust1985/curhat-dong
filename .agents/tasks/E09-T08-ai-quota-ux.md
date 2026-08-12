---
id: E09-T08
epic: E09
title: Integrasi kuota harian di chat
status: done
estimate: 0.5d
depends_on: [E08-T07, E09-T03]
refs: [DESIGN-REF §2.8c, TECH-SPEC §4.7]
---

## Scope
Indikator sisa kuota + state limit tercapai.

## Acceptance criteria
- Copy hangat + CTA Cari Listener, bukan error mentah.
- Sisa kuota ditampilkan tanpa membuat user merasa sedang dihitung-hitung.
- Kuota habis di tengah stream ditangani rapi (selesaikan pesan berjalan).

## Verifikasi
Test: kirim pesan saat kuota habis → 429 dengan copy yang benar + CTA.
