---
id: E02-T01
epic: E02
title: Setup packages/database — Prisma 7 + adapter-pg
status: todo
estimate: 1d
depends_on: [E01-T08]
refs: [TECH-SPEC §1.1, TECH-SPEC §2.1, CLAUDE.md stack]
---

## Scope
- `packages/database` dengan `prisma.config.ts` (konvensi Prisma 7) + `@prisma/adapter-pg`.
- Client singleton, konfigurasi connection pool.
- Script: `generate`, `migrate:dev`, `migrate:deploy`, `seed`, `studio`.

## Acceptance criteria
- **Prisma 7 conventions**, bukan Prisma 6 (`prisma.config.ts`, bukan blok `generator` gaya lama).
- Generated client tidak tercampur source domain (TECH-SPEC §1.6).
- Semua waktu disimpan UTC.
- Produksi hanya menjalankan `migrate deploy`.

## Verifikasi
`pnpm --filter @curhat/database prisma migrate dev` sukses di database kosong; client bisa query.
