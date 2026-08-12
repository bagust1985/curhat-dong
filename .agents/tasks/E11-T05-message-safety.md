---
id: E11-T05
epic: E11
title: Safety scan pesan room (L0–L3)
status: done
estimate: 1.5d
depends_on: [E11-T03, E07-T07]
refs: [PRD §15.5, TECH-SPEC §4.3.1]
---

## Scope
Klasifikasi async tiap pesan; aksi sesuai mapping TECH-SPEC §4.3.1; event `room:safety`.

## Acceptance criteria
- **Jangan auto-close room atau memblokir pengiriman pada L3** — pesan tetap terkirim, resources ditampilkan ke kedua pihak.
- L2 target-directed (harassment/threat/doxxing) → warning ke pengirim + surface report/block ke penerima.
- Klasifikasi **async**, tidak menambah latency delivery.
- Isi pesan tidak pernah masuk log analitik generik (non-negotiable #3).

## Verifikasi
Test tiap level; pastikan L3 tidak pernah menutup room; ukur latency tidak berubah.
