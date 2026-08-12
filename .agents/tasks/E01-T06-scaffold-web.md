---
id: E01-T06
epic: E01
title: Scaffold apps/web (Next 16.3 + Tailwind 4 + shadcn/ui)
status: done
estimate: 1d
depends_on: [E01-T03, E01-T04]
refs: [TECH-SPEC §1.1, TECH-SPEC §1.2, DESIGN-REF §0]
---

## Scope
- Next.js 16.3.x App Router, React 19, Tailwind 4, shadcn/ui.
- Design token dari DESIGN-REF §0: base dark navy/charcoal, aksen warm, radius 16–20px, rounded sans.
- Dark/light/system + provider tema.

## Acceptance criteria
- Tailwind 4 **hanya** di web/admin — `apps/mobile` tidak terpengaruh (TECH-SPEC §1.2).
- Dark mode first-class, bukan afterthought.
- Kontras token lolos WCAG AA di dark **dan** light (PRD §23.1).

## Verifikasi
Halaman contoh menampilkan seluruh token; cek kontras dengan kalkulator, catat hasilnya.
