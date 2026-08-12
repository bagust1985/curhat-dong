---
id: E14-T09
epic: E14
title: Content management
status: done
estimate: 1d
depends_on: [E14-T06]
refs: [PRD §18, DESIGN-REF §3.5]
---

## Scope
List post (filter reported/held/level/kategori), aksi inspect/remove/restore/lock comments/add warning/suspend author.

## Acceptance criteria
- Restore mengembalikan post ke state sebelumnya dengan benar.
- Lock comments tidak menghapus komentar yang sudah ada.
- Semua aksi teraudit.

## Verifikasi
Test remove → restore → post kembali published dengan komentar utuh.
