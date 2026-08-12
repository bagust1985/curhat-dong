---
id: E13-T04
epic: E13
title: Recent searches (lokal)
status: done
estimate: 0.5d
depends_on: [E13-T02]
refs: [DESIGN-REF §2.13]
---

## Scope
Simpan riwayat pencarian **di perangkat**, bisa dihapus user.

## Acceptance criteria
- Lokal saja, tidak dikirim ke server — apa yang dicari seseorang di app curhat adalah informasi sensitif.
- Bisa dibersihkan dari Settings.

## Verifikasi
Cek network: tidak ada request yang mengirim riwayat pencarian.
