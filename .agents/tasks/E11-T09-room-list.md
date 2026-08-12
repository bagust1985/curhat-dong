---
id: E11-T09
epic: E11
title: Daftar room + report/block dari room
status: todo
estimate: 0.5d
depends_on: [E11-T07]
refs: [TECH-SPEC §3.4, DESIGN-REF §2.11]
---

## Scope
`GET /rooms` + aksi Report / Block / Akhiri Sesi dari header room.

## Acceptance criteria
- Daftar room tidak menampilkan cuplikan isi pesan.
- Block dari room langsung memutus sesi dan mencegah matching ulang.
- Report dari room membawa konteks room untuk moderator (akses tetap teraudit).

## Verifikasi
Test: block dari dalam room → sesi berakhir, keduanya tidak bisa dicocokkan lagi.
