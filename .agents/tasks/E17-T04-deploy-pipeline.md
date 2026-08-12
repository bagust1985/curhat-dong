---
id: E17-T04
epic: E17
title: Pipeline deploy + migration gate
status: todo
estimate: 1.5d
depends_on: [E17-T02, E17-T03]
refs: [TECH-SPEC §9.3, CLAUDE.md non-negotiable #7]
---

## Scope
SSH deploy: pull image → `prisma migrate deploy` → `docker compose up -d` → healthcheck gate.

## Acceptance criteria
- **Migration gagal → STOP deployment** (TECH-SPEC §9.3), jangan lanjut dengan skema tidak konsisten.
- Produksi **hanya** `migrate deploy`, tidak pernah `migrate dev`.
- **Migration destructive wajib review manual** (non-negotiable #7) — pipeline menolak menjalankannya otomatis.
- Healthcheck gagal → rollback ke image sebelumnya.

## Verifikasi
Uji deploy dengan migration sengaja gagal → deployment berhenti, versi lama tetap jalan.
