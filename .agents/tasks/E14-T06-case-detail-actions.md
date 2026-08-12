---
id: E14-T06
epic: E14
title: Detail case + 7 aksi moderasi
status: done
estimate: 1.5d
depends_on: [E14-T05, E07-T10]
refs: [PRD §15, DESIGN-REF §3.3]
---

## Scope
Detail: konten (teraudit), riwayat safety user, klasifikasi AI (level, skor), riwayat report. Aksi: Approve/Remove/Warn/Mute/Suspend/Ban/Escalate + bulk untuk Low.

## Acceptance criteria
- Alasan **wajib** untuk setiap aksi.
- Bulk action hanya untuk queue Low.
- UI tidak menyediakan jalan untuk menghukum user karena L3 (non-negotiable #2).
- Setiap aksi memberi tahu user + info cara banding.

## Verifikasi
Test setiap aksi end-to-end; verifikasi notifikasi ke user memuat info banding.
