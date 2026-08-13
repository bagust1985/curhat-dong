---
id: E15-T15
epic: E15
title: Explore, Search, Notifikasi
status: done
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

## Catatan implementasi

- Halaman notifikasi **hanya me-render apa yang dikirim API** dan tidak menarik
  targetnya untuk "memperkaya" baris dengan preview — itu persis perubahan yang
  kelihatan wajar tapi melanggar non-negotiable #3. Ada test yang gagal kalau
  muncul request ke `/posts/...` dari halaman ini.
- Deep link yang targetnya sudah hilang **tidak diikuti**; catatan dari server
  yang ditampilkan (E12-T07).
- Recent search tetap di perangkat (`lib/recent-searches.ts`); test memeriksa
  tidak ada POST apa pun selain refresh sesi.
- Status belum dibaca dibawa di accessible name, bukan cuma warna titik.
