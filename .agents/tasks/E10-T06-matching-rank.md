---
id: E10-T06
epic: E10
title: Matching — ranking kandidat
status: todo
estimate: 1d
depends_on: [E10-T05]
refs: [TECH-SPEC §4.5, PRD §11.2]
---

## Scope
Ranking: helpful score, felt heard score, pengalaman topik, interaksi positif sebelumnya.

## Acceptance criteria
- **Menolak atau melewatkan offer tidak menurunkan skor** (PRD §11.2) — sistem tidak boleh menghukum orang yang menjaga batasnya.
- Bobot dari `app_configs`.
- Tidak ada leaderboard publik; skor tetap internal.

## Verifikasi
Unit test skoring; test bahwa decline tidak mengubah ranking listener.
