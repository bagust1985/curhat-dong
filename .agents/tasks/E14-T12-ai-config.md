---
id: E14-T12
epic: E14
title: AI moderation config + audit trail + rollback
status: done
estimate: 1.5d
depends_on: [E14-T03, E08-T04]
refs: [PRD §18, TECH-SPEC §4.4, DESIGN-REF §3.8]
---

## Scope
Threshold per kategori risiko, auto-action mapping per level, model routing, prompt version selector, diff viewer, rollback.

## Acceptance criteria
- **Semua perubahan menghasilkan audit trail + diff** (PRD §18).
- Hanya Super Admin.
- Rollback prompt version tanpa deploy.
- UI tidak boleh menyediakan cara mematikan klasifikasi safety sepenuhnya (non-negotiable #1).

## Verifikasi
Test: ubah threshold → audit + diff tercatat; rollback berfungsi; tidak ada toggle "matikan safety".
