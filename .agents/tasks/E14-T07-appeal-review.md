---
id: E14-T07
epic: E14
title: Halaman Appeal Review
status: done
estimate: 1.5d
depends_on: [E14-T06, E07-T12]
refs: [PRD §15.4, TECH-SPEC §19.3, DESIGN-REF §3.13]
---

## Scope
Queue banding + detail + keputusan Upheld/Overturned/Reduced + widget rasio overturned per kategori.

## Acceptance criteria
- **Banding atas keputusan sendiri tidak muncul di queue moderator tersebut** — disembunyikan sistem, bukan mengandalkan kejujuran.
- Tanpa reviewer lain → otomatis naik ke Super Admin.
- Widget rasio overturned menautkan langsung ke `/ai-config` untuk kalibrasi threshold.
- Keputusan wajib beralasan dan dikirim ke user dengan bahasa manusia.

## Verifikasi
Test: moderator A memutus aksi → banding tidak terlihat di queue A, terlihat di queue B.
