---
id: E09-T05
epic: E09
title: Safety in-chat (L0–L3)
status: done
estimate: 1.5d
depends_on: [E09-T03, E07-T07]
refs: [PRD §15.5, TECH-SPEC §4.3, §4.3.1]
---

## Scope
Moderasi input + klasifikasi risiko paralel; mapping level sesuai TECH-SPEC §4.3.1.

## Acceptance criteria
- **DONG AI tidak boleh menolak bicara** saat mendeteksi risiko ("maaf saya tidak bisa membahas ini") — yang benar: tetap hadir, suportif, arahkan ke bantuan manusia/profesional.
- L3 → `safety.intervention` + resources + case Critical, **tanpa** menghukum user.
- Klasifikasi berjalan paralel, tidak memblokir streaming.

## Verifikasi
Test skenario risiko tinggi: AI tetap merespons suportif **dan** event intervention terkirim.
