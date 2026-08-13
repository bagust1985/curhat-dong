---
id: E16-T02
epic: E16
title: Expo Router + bottom nav
status: done
estimate: 1d
depends_on: [E16-T01]
refs: [DESIGN-REF §1, PRD §23]
---

## Scope
Struktur route + bottom nav: HOME · EXPLORE · [+ CURHAT floating] · LISTEN · PROFILE.

## Acceptance criteria
- FAB "+ Curhat" floating di tengah sesuai DESIGN-REF §1.
- Deep link siap untuk notifikasi.
- Back handling Android benar (tidak keluar app dari tengah alur).

## Verifikasi
Uji navigasi + tombol back fisik di seluruh tab.

## Catatan implementasi

- **Nav mobile beda dari web.** Mobile ikut DESIGN-REF §1 (HOME · EXPLORE ·
  [+ CURHAT] · LISTEN · PROFILE); web ikut brand mock (Beranda · Chat ·
  Komunitas · Notifikasi · Akun, keputusan 12 Agt 2026). Ini **perbedaan produk
  yang belum pernah diputuskan siapa pun** — jatuh dari dua dokumen yang
  bertentangan. Dicatat di `lib/navigation.ts`, bukan dipilih diam-diam.
- Deep link notifikasi lewat allow-list (`resolveDeepLink`): payload dari luar
  app tidak boleh menentukan tujuan navigasi. Yang tidak dikenal → `/notifications`.
- Back Android: helper `useAndroidBack` + daftar rute yang dijaga.
