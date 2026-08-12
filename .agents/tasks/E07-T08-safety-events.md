---
id: E07-T08
epic: E07
title: Safety events & moderation case creation
status: todo
estimate: 1d
depends_on: [E07-T04]
refs: [TECH-SPEC §2.2, §18.7, PRD §15.3]
---

## Scope
Buat `safety_events` + `moderation_cases` dengan queue dan `sla_due_at` sesuai PRD §15.3.

## Acceptance criteria
- `sla_due_at` menghitung jendela malam (21.00–04.00) secara berbeda.
- Deduplikasi: laporan berulang atas target sama menambah bobot case yang ada, bukan membuat case baru.
- Sumber case tercatat (AI / report / system / listener escalate).

## Verifikasi
Unit test perhitungan `sla_due_at` termasuk kasus lintas tengah malam.
