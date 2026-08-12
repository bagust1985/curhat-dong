---
id: E14-T14
epic: E14
title: Dashboard + Analytics
status: done
estimate: 1.5d
depends_on: [E14-T02, E06-T06]
refs: [PRD §18, §19.1, DESIGN-REF §3.2, §3.10]
---

## Scope
Metric cards (Total/New Users, DAU/WAU/MAU, Active Listeners, Curhat/day, Comments/day, AI Conversations, Listener Sessions, Report Rate, **Felt Heard Rate**), funnel, retention D1/D7/D30, response coverage, time-to-first-response, AI usage & cost, SLA compliance.

## Acceptance criteria
- Definisi metrik **persis** PRD §19.1 — terutama Felt Heard Rate (dismissed tidak masuk penyebut).
- Alert strip saat antrian Critical > 0.
- Agregasi lewat job harian, bukan query berat saat halaman dibuka.
- Analytics tidak menampilkan isi curhat.

## Verifikasi
Bandingkan angka dashboard dengan query manual di data uji; harus sama persis.
