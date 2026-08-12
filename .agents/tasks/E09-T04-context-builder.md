---
id: E09-T04
epic: E09
title: Context builder + batas jendela
status: todo
estimate: 1d
depends_on: [E09-T03]
refs: [TECH-SPEC §4.3]
---

## Scope
Susun konteks percakapan dengan batas token; ringkas riwayat lama bila perlu.

## Acceptance criteria
- Batas token dihormati agar biaya terkendali.
- Ringkasan tidak menghilangkan sinyal keselamatan dari pesan-pesan sebelumnya.
- Konteks tidak pernah mencampur percakapan user lain.

## Verifikasi
Test percakapan panjang (>50 pesan) tetap dalam batas token dan tetap koheren.
