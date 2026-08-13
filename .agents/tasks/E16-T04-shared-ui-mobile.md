---
id: E16-T04
epic: E16
title: Komponen mobile — CurhatCard, ReactionBar, Mood/Intent picker
status: done
estimate: 2d
depends_on: [E16-T02, E15-T02]
refs: [DESIGN-REF §5, PRD §23.1]
---

## Scope
Port komponen inti ke NativeWind dengan tampilan setara web.

## Acceptance criteria
- Label aksesibilitas untuk seluruh ikon mood/reaction/intent (PRD §23.1).
- Font scaling OS dihormati.
- Touch target ≥44px.
- Reaksi tetap berupa kata empati, bukan like.

## Verifikasi
Uji dengan TalkBack + ukuran font sistem terbesar.

## Catatan implementasi

- Kosakata mood/reaction/intent **dipindah ke `@curhat/types`** dan dipakai web
  + mobile. Sebelumnya hanya ada di `apps/web/lib/vocabulary.ts`; menyalinnya ke
  mobile berarti dua salinan yang melenceng pada edit pertama.
- Tidak ada satu pun `allowFontScaling={false}` — RN menghormati ukuran font OS
  secara default, dan mematikannya adalah perubahan satu kata yang merusak
  aplikasi buat orang yang paling butuh.
- Touch target 44dp lewat `minHeight`/`minWidth`, termasuk tombol reaksi.
- **Uji TalkBack belum dijalankan** (butuh perangkat).
