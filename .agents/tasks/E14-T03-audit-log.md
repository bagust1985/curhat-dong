---
id: E14-T03
epic: E14
title: Audit log + halaman /audit
status: todo
estimate: 1.5d
depends_on: [E14-T02]
refs: [PRD §25.6, TECH-SPEC §3.6, DESIGN-REF §3.11]
---

## Scope
Catat aktor, aksi, target, diff, ip_hash, waktu. Halaman filter + diff viewer + export.

## Acceptance criteria
- **Setiap akses konten privat wajib menghasilkan audit log** (PRD §25.6).
- Audit log tidak dapat diubah atau dihapus dari UI admin.
- Diff menampilkan perubahan config tanpa membocorkan isi curhat.

## Verifikasi
Test: buka konten privat → audit log tercipta; coba hapus log → tidak mungkin.
