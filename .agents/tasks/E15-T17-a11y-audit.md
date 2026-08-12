---
id: E15-T17
epic: E15
title: Audit aksesibilitas & responsif
status: todo
estimate: 1.5d
depends_on: [E15-T16]
refs: [PRD §23.1, DESIGN-REF §0.1]
---

## Scope
Audit menyeluruh: kontras, font scaling, screen reader, keyboard, reduced motion, responsif desktop/tablet/mobile browser.

## Acceptance criteria
- Kontras AA lolos di dark, light, **dan** Midnight Mode.
- Font scaling 200% tanpa layout pecah atau teks terpotong.
- Seluruh ikon mood/reaction/intent terbaca screen reader.
- Navigasi keyboard penuh dengan focus visible.
- `prefers-reduced-motion` mematikan animasi.

## Verifikasi
Jalankan axe/Lighthouse + uji manual screen reader; lampirkan laporan di PR. Temuan blocker harus diperbaiki sebelum epic ditutup.
