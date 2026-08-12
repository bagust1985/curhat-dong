---
id: E14-T08
epic: E14
title: User management
status: done
estimate: 1.5d
depends_on: [E14-T04]
refs: [PRD §18, DESIGN-REF §3.4]
---

## Scope
Cari (alias/ID/email-hash), filter status, detail user (status, trust/safety history, report by/against, device/risk, sesi listener), aksi warn/mute/suspend/ban/unban.

## Acceptance criteria
- Pencarian memakai **email-hash**, bukan email plaintext.
- Aksi wajib beralasan + durasi.
- Trust score terlihat admin tapi tidak pernah keluar ke API publik.

## Verifikasi
Test: cari dengan email plaintext → tidak didukung; semua aksi menghasilkan audit log.
