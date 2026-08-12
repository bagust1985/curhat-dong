---
id: E08-T03
epic: E08
title: Model routing cheap vs advanced
status: todo
estimate: 1d
depends_on: [E08-T02]
refs: [TECH-SPEC §4.4, PRD §10]
---

## Scope
Cheap: tagging, emotion, intent, spam, klasifikasi dasar. Advanced: safety ambigu, konteks sulit, percakapan DONG AI kompleks.

## Acceptance criteria
- Aturan routing dari config, bisa diubah tanpa deploy.
- Safety ambigu **naik** ke advanced, tidak pernah turun demi hemat.
- Keputusan routing tercatat di `ai_usage_events`.

## Verifikasi
Unit test tabel routing; test bahwa input safety ambigu memilih advanced.
