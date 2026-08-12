---
id: E16-T06
epic: E16
title: DONG AI (mobile) — SSE streaming
status: todo
estimate: 1.5d
depends_on: [E16-T05, E09-T03]
refs: [DESIGN-REF §2.8, TECH-SPEC §3.3]
---

## Scope
Chat streaming via SSE di React Native, pilih personality, bridge card, indikator kuota.

## Acceptance criteria
- Streaming stabil di jaringan seluler yang naik-turun.
- App masuk background lalu kembali → percakapan tidak rusak.
- Disclaimer permanen tetap terlihat.

## Verifikasi
Uji dengan mematikan/menyalakan jaringan di tengah streaming.
