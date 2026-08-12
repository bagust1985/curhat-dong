---
id: E15-T15
epic: E15
title: Explore, Search, Notifikasi
status: todo
estimate: 1.5d
depends_on: [E15-T02, E13-T02]
refs: [DESIGN-REF §2.12, §2.13, §2.14]
---

## Scope
Explore (grid 15 kategori + jumlah curhat aktif), Search (tabs Curhat/Listener/Topik + recent lokal), Notifikasi (list per tipe, read/unread, deep link).

## Acceptance criteria
- **Notifikasi memakai template generik** — isi curhat tidak pernah tampil (non-negotiable #3).
- Recent searches tersimpan lokal saja.
- Empty state hangat di ketiga halaman.

## Verifikasi
Cek payload notifikasi di UI; verifikasi recent search tidak dikirim ke server.
