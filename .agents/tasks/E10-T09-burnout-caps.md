---
id: E10-T09
epic: E10
title: Cap burnout — konkuren, harian, cooldown
status: todo
estimate: 1.5d
depends_on: [E10-T07]
refs: [PRD §11.2, TECH-SPEC §4.7, DESIGN-REF §2.20]
---

## Scope
Tegakkan max 3 konkuren, 8 sesi/hari (lalu availability auto-off), cooldown 10 menit antar sesi, reminder istirahat setelah 3 sesi berturut / 90 menit aktif.

## Acceptance criteria
- Ditegakkan **server-side**, bukan sekadar UI.
- Cap tercapai → availability auto-off dengan tone **apresiatif, bukan peringatan**; tidak ada tombol untuk memaksa lanjut.
- `listener_session_counters` reset per hari sesuai timezone user.
- Tidak satu pun state ini menurunkan ranking listener.

## Verifikasi
Unit test counter & cooldown, termasuk pergantian hari. Integration: sesi ke-9 tidak pernah ditawarkan.
