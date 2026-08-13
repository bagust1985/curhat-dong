---
id: E15-T17
epic: E15
title: Audit aksesibilitas & responsif
status: done
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

## Catatan implementasi

- **axe-core dijalankan atas 16 layar** di dalam landmark `<main>` seperti halaman
  aslinya — nol violation. Rule kontras **dimatikan di axe dengan sengaja**: jsdom
  tidak punya computed color, jadi "lolos" di sana tidak berarti apa-apa.
  Kontras tetap diverifikasi numerik untuk light, dark, dan midnight
  (`lib/contrast.test.ts`).
- **Temuan diperbaiki:** FAB "+ Curhat" memakai tinggi tetap `h-14` dengan
  `text-2xl` — pada penskalaan teks 200% lingkarannya memotong glyph sendiri.
  Diganti `min-h-14 min-w-14 aspect-square`.
- Scan sumber menegakkan dua properti yang bikin 200% selamat: tidak ada tinggi
  piksel tetap pada kotak berisi teks, dan tidak ada `whitespace-nowrap`.
  Ditambah: tidak ada `onClick` pada elemen non-interaktif (keyboard).
- **Yang belum dan tidak diklaim lolos:** uji screen reader sungguhan, penskalaan
  200% di browser nyata, dan uji responsif di perangkat. Prosedurnya ditulis di
  `docs/A11Y-AUDIT-E15.md` supaya bisa dijalankan sama persis.
