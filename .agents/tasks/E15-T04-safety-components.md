---
id: E15-T04
epic: E15
title: Komponen safety — FeltHeardSheet, ReportSheet, BlockDialog, SafetyResourceCard, DestructiveConfirm
status: done
estimate: 1.5d
depends_on: [E15-T02]
refs: [DESIGN-REF §5 (10–12, 20), §2.17]
---

## Scope
FeltHeardSheet, ReportSheet (10 kategori), BlockDialog, SafetyResourceCard (tap-to-call/chat), DestructiveConfirm (konfirmasi ganda).

## Acceptance criteria
- SafetyResourceCard: tap-to-call/chat berfungsi di web & mobile browser.
- DestructiveConfirm menuliskan konsekuensi **sebelum** tombol, bukan sesudah.
- BlockDialog menjelaskan efek block secara jujur.
- FeltHeardSheet punya opsi dismiss yang jelas — dismiss bukan "Belum".

## Verifikasi
Uji tap-to-call di perangkat nyata; review copy tiap komponen.
