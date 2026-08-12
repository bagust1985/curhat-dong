---
id: E08-T09
epic: E08
title: Klasifikasi safety independen dari model percakapan
status: todo
estimate: 1d
depends_on: [E08-T03]
refs: [TECH-SPEC §4.3, PRD §10]
---

## Scope
Pastikan `assessRisk`/`moderate` berjalan sebagai panggilan terpisah, bukan menumpang output model percakapan.

## Acceptance criteria
- **Safety classifier tidak hanya bergantung pada conversation model** (TECH-SPEC §4.3) — model yang sedang berempati bukan alat ukur risiko yang netral.
- Berjalan paralel dengan generasi balasan agar tidak menambah latency.
- Kegagalan classifier ditangani sebagai timeout (E07-T05), bukan diabaikan.

## Verifikasi
Test: matikan conversation model → klasifikasi risiko tetap berjalan.
