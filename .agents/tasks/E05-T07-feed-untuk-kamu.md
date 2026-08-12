---
id: E05-T07
epic: E05
title: Feed tab "Untuk Kamu" (emotional matching v1)
status: done
estimate: 1.5d
depends_on: [E05-T06]
refs: [PRD §6, §20, TECH-SPEC §4.7]
---

## Scope
Ranking sederhana: topik yang diikuti, emotional relevance, freshness, unanswered, safety, interaksi positif sebelumnya.

## Acceptance criteria
- **Bukan ML** — skor berbobot sederhana (recommendation ML kompleks out of scope Phase 1).
- Penalti untuk toxicity/rage bait/spam/sensationalism (PRD §20).
- Konten sensitif **tidak** dipromosikan karena engagement tinggi — safety di atas virality.
- Bobot dari `app_configs` agar bisa dikalibrasi tanpa deploy.

## Verifikasi
Unit test fungsi skor; test bahwa post L1 dengan engagement tinggi tidak naik di atas post L0 sebanding.
