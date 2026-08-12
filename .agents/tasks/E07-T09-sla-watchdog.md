---
id: E07-T09
epic: E07
title: Job SLA watchdog + alert ops
status: done
estimate: 1d
depends_on: [E07-T08]
refs: [PRD §15.3, TECH-SPEC §18.7, §10.2]
---

## Scope
Job berkala mendeteksi case yang melewati `sla_due_at` → alert (Telegram/ops channel) → eskalasi ke Super Admin.

## Acceptance criteria
- Case Critical yang lewat SLA memicu alert, tidak diam-diam menua di queue.
- **Alert tidak memuat isi konten** (non-negotiable #3) — hanya id case, queue, umur.
- Anti-spam alert (jangan mengulang tiap menit untuk case yang sama).

## Verifikasi
Test: case critical dibuat mundur waktunya → alert terkirim sekali.
