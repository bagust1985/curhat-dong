---
id: E14-T10
epic: E14
title: Listener management
status: todo
estimate: 1d
depends_on: [E14-T08]
refs: [PRD §18, DESIGN-REF §3.6]
---

## Scope
List listener + skor (helpful, felt heard, safety status), suspend listener mode, review report, revoke.

## Acceptance criteria
- Suspend listener mode **tidak** otomatis membanned akun user-nya.
- Sesi aktif ditutup dengan sopan saat listener di-suspend, bukan diputus mendadak.
- Skor ditampilkan sebagai konteks, bukan peringkat kompetitif.

## Verifikasi
Test: suspend listener dengan sesi aktif → sesi ditutup rapi, akun tetap normal.
