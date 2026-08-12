---
id: E15-T01
epic: E15
title: Design system & token (packages/ui)
status: todo
estimate: 1.5d
depends_on: [E01-T06]
refs: [DESIGN-REF §0, §0.1, PRD §23.1]
---

## Scope
Token warna (base dark navy/charcoal, aksen warm amber/peach), radius 16–20px, spacing lega, rounded sans, tema dark/light/system + Midnight Mode.

## Acceptance criteria
- Hindari nuansa rumah sakit/klinik/dating/crypto/korporat (DESIGN-REF §0).
- Merah agresif hanya untuk destructive.
- **Kontras AA terverifikasi angka** di dark, light, dan Midnight Mode — kombinasi warm-on-dark gampang gagal, jangan andalkan mata.
- `prefers-reduced-motion` dihormati di level token/utility.

## Verifikasi
Halaman token + laporan kontras terlampir di PR.
