---
id: E17-T13
epic: E17
title: Load test & verifikasi target performa
status: todo
estimate: 1.5d
depends_on: [E17-T04]
refs: [TECH-SPEC §8.3]
---

## Scope
Load test terhadap target: API p95 < 500ms, chat delivery < 2s, feed usable 2–3s, availability 99.5%+.

## Acceptance criteria
- Uji di VPS 4 vCPU / 8 GB sesuai spesifikasi produksi.
- Skenario peak malam hari (jam penggunaan tertinggi produk ini).
- Bottleneck dicatat beserta rencana perbaikannya.

## Verifikasi
Laporan load test dilampirkan; target yang tidak tercapai jadi task baru, bukan diabaikan.
