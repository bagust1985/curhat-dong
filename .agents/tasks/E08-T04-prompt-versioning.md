---
id: E08-T04
epic: E08
title: Prompt versioning + rollback
status: todo
estimate: 1d
depends_on: [E08-T03]
refs: [TECH-SPEC §4.4, PRD §18]
---

## Scope
Prompt disimpan berversi; setiap klasifikasi mencatat `prompt_version`; rollback ke versi sebelumnya.

## Acceptance criteria
- Perubahan prompt menghasilkan **audit trail** (PRD §18).
- Rollback tidak butuh deploy.
- Klasifikasi lama tetap bisa ditelusuri ke prompt yang menghasilkannya — tanpa ini, kalibrasi threshold cuma tebakan.

## Verifikasi
Test: ubah prompt → versi naik → klasifikasi baru memakai versi baru; rollback bekerja.
