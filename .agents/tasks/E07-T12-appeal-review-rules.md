---
id: E07-T12
epic: E07
title: Aturan reviewer banding (reviewer ≠ pemutus)
status: done
estimate: 1d
depends_on: [E07-T11]
refs: [PRD §15.4, TECH-SPEC §19.2]
---

## Scope
Tegakkan `reviewer_id != decider` di service layer **dan** database constraint; auto-eskalasi ke Super Admin bila tidak ada reviewer lain.

## Acceptance criteria
- Moderator tidak melihat banding atas keputusannya sendiri di queue — **sistem yang menyembunyikan**, bukan mengandalkan kejujuran.
- Efek keputusan: `overturned` memulihkan konten/akun; `reduced` memperpendek durasi; semuanya masuk audit log.
- Rasio `overturned` per kategori tersedia untuk kalibrasi threshold AI.

## Verifikasi
Test: coba putuskan banding sendiri → ditolak di service **dan** database.
