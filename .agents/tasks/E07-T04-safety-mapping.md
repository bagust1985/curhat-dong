---
id: E07-T04
epic: E07
title: Safety mapping L0–L3
status: todo
estimate: 1d
depends_on: [E07-T03]
refs: [PRD §8, TECH-SPEC §4.1, CLAUDE.md test minimal]
---

## Scope
Petakan skor risiko → level → aksi:
`L0` publish · `L1` publish + monitoring · `L2` HOLD + case High/Medium · `L3` tidak masuk feed + intervention + case Critical.

## Acceptance criteria
- Threshold dari `app_configs` (bisa dikalibrasi admin, TECH-SPEC §4.4).
- **L3 tidak pernah menghasilkan aksi punitive** (non-negotiable #2).
- L2 memberi tahu user "sedang ditinjau", bukan diam-diam menghilang.
- Setiap keputusan menghasilkan `safety_events`.

## Verifikasi
**Unit test mapping safety wajib** (CLAUDE.md) — seluruh 4 level + batas threshold.
