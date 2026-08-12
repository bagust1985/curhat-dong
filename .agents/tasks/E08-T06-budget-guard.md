---
id: E08-T06
epic: E08
title: Budget alert & degradasi bertahap
status: done
estimate: 1.5d
depends_on: [E08-T05]
refs: [PRD §10, TECH-SPEC §4.7]
---

## Scope
Pantau pemakaian harian terhadap `AI_DAILY_BUDGET`; alert 70% & 90%; pada ≥90% turunkan routing non-safety ke cheap model dan kuota user ke 25.

## Acceptance criteria
- **Klasifikasi safety TIDAK PERNAH didegradasi, di-skip, atau dimatikan karena budget** (PRD §10, non-negotiable #1).
- Budget habis total → yang berhenti adalah endpoint percakapan DONG AI (503 + copy hangat), **bukan** `analyze-post`/`analyze-message`.
- Alert ke ops channel, tidak memuat isi percakapan.

## Verifikasi
Test: set budget terlampaui → `chat` terdegradasi/berhenti, `assessRisk` tetap memakai jalur normal. Test ini menjaga non-negotiable #1.
