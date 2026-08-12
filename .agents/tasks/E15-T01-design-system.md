---
id: E15-T01
epic: E15
title: Design system & token (packages/ui)
status: done
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

## Catatan implementasi
Palette diambil dari brand kit `docs/` (keputusan user, 12 Agt 2026), bukan
"navy/charcoal + amber/peach" di Scope di atas. Dua pasangan brand kit **gagal
AA** dan ditangani: putih di atas purple `#7C5CFC` = 4.38:1 (primary diperdalam
ke `#5B3BE0`), putih di atas pink `#FF688A` = 2.76:1 (pink tidak pernah membawa
teks putih). Swatch keenam brand kit tertulis `#F755FF` (magenta) padahal
gambarnya nyaris putih — dibaca sebagai `#F7F5FF`.

## Verifikasi
Halaman token + laporan kontras terlampir di PR.
