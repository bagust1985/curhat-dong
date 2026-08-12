---
id: E13-T03
epic: E13
title: Batas privasi pencarian
status: todo
estimate: 0.5d
depends_on: [E13-T02]
refs: [PRD §13, CLAUDE.md non-negotiable #5]
---

## Scope
Pastikan pencarian tidak menjadi jalan memutar untuk menembus privasi.

## Acceptance criteria
- Halaman hasil pencarian **noindex**.
- Pencarian tidak bisa dipakai mengorelasikan post anonim ke satu akun.
- Pesan private room & percakapan AI **tidak pernah** dapat dicari.
- Query pencarian tidak dicatat bersama identitas user di log analitik.

## Verifikasi
Test: cari isi pesan private room → nol hasil. Cek header noindex.
