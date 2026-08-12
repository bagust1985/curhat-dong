---
id: E07-T10
epic: E07
title: Aksi moderasi (7 aksi) + audit
status: todo
estimate: 1.5d
depends_on: [E07-T08]
refs: [PRD §15, TECH-SPEC BAGIAN 19]
---

## Scope
Approve, Remove, Warn, Mute, Suspend, Ban, Escalate — semuanya wajib alasan dan menghasilkan `audit_logs`.

## Acceptance criteria
- `is_appealable=true` untuk remove/warn/mute/suspend/ban; false untuk approve/escalate.
- Mute/suspend punya durasi.
- User diberi tahu: aksi apa, kategori alasan, **dan cara mengajukan banding**.
- **Level 3 tidak pernah menghasilkan aksi punitive** — tidak ada jalur kode yang bisa melakukannya.

## Verifikasi
Test setiap aksi menghasilkan audit log; test bahwa L3 tidak bisa memicu ban.
