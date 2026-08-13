---
id: E17-T13
epic: E17
title: Load test & verifikasi target performa
status: in_progress
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

## Catatan implementasi

- Skrip k6 `infrastructure/load-test/peak-night.js` memodelkan ramp 20.00→01.00,
  bukan beban datar siang hari — produk ini tidak pernah berbentuk begitu.
- Threshold p95<500ms, error<0.5%, feed p95<3s, post p95<1.5s **menggagalkan run**
  sendiri, jadi run hijau tidak butuh interpretasi.
- Campuran baca:tulis 85:15 — membaca yang paling sering dilakukan orang.
- **Belum pernah dijalankan**: belum ada VPS staging. README-nya sengaja kosong
  dari angka, bukan diisi estimasi yang nanti terbaca seperti hasil pengukuran.
