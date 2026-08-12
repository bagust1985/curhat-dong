---
id: E07-T01
epic: E07
title: Local rule engine (pre-AI)
status: done
estimate: 1.5d
depends_on: [E05-T02]
refs: [TECH-SPEC §4.1, §4.2]
---

## Scope
Rule berbasis pola yang jalan **sebelum** AI: spam dasar, kata kunci risiko tinggi, pola scam, tautan berbahaya.

## Acceptance criteria
- Menghasilkan sinyal `high_risk: boolean` — inilah yang menentukan perilaku fallback saat AI timeout (TECH-SPEC §4.2).
- Cepat & sinkron (jangan menambah latency submit yang terasa).
- Daftar pola dari config, bisa diperbarui tanpa deploy.
- Sengaja condong ke sensitif untuk sinyal high-risk: false positive di sini hanya berarti konten ditinjau, false negative berarti sinyal krisis lolos.

## Verifikasi
Unit test korpus contoh (aman & berisiko); ukur latency < 50ms.
