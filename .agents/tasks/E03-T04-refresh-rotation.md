---
id: E03-T04
epic: E03
title: Rotating refresh token + reuse detection
status: todo
estimate: 1.5d
depends_on: [E03-T03]
refs: [TECH-SPEC §5.1, CLAUDE.md test minimal]
---

## Scope
- Refresh token disimpan **hashed**, scoped per device/session, punya `family_id`.
- `POST /auth/refresh` merotasi token dan mencabut yang lama.
- Reuse detection: token lama dipakai lagi → cabut seluruh family → wajib login ulang.

## Acceptance criteria
- Rotasi normal: token lama tidak bisa dipakai lagi.
- Reuse terdeteksi → **semua** sesi di family tercabut, tercatat di audit.
- Race dua refresh bersamaan tidak menghasilkan false positive yang mengunci user yang tidak bersalah.

## Verifikasi
Unit test rotasi + reuse (wajib, CLAUDE.md). Test khusus untuk skenario race.
