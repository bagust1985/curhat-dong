---
id: E17-T04
epic: E17
title: Pipeline deploy + migration gate
status: in_progress
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

## Catatan implementasi

- Urutannya: gate migration destruktif → pull image SHA → `prisma migrate
  deploy` → `up -d` → health gate → rollback kalau gagal.
- **Migration gagal = deployment berhenti**, versi lama tetap jalan. Skema yang
  setengah termigrasi bertemu kode yang mengasumsikan setengah lainnya adalah
  kegagalan yang paling mahal dipulihkan.
- Produksi hanya `migrate deploy`.
- **Gate destruktif membaca SQL-nya, bukan mempercayai bahwa ada yang membaca.**
  Persetujuan ditulis sebagai baris `-- curhat:destructive-approved <alasan>`
  **di dalam file migration**, supaya muncul di diff, di review, dan di
  `git blame` — bukan flag CI yang hilang begitu run-nya kedaluwarsa.
  Diuji 15 test + dijalankan sungguhan atas 7 migration repo ini (lolos), lalu
  atas migration `DROP COLUMN` buatan (ditolak, exit 1; setelah diberi marker,
  lolos).
- Health gate menembak `/health/ready`; `IMAGE_TAG` di `.env` baru ditulis
  **setelah** versi baru benar-benar melayani, jadi target rollback selalu versi
  yang pernah bekerja.
- **Belum dijalankan end-to-end** (butuh VPS + secrets).
