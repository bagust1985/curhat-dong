---
id: E01-T05
epic: E01
title: Scaffold apps/api (NestJS 11)
status: done
estimate: 1d
depends_on: [E01-T03, E01-T04]
refs: [TECH-SPEC §1.4, TECH-SPEC §1.5]
---

## Scope
- NestJS 11 modular monolith; buat 18 module kosong sesuai TECH-SPEC §1.4 (termasuk `profiles`).
- `common/` (filter, interceptor, guard), `config/`, `main.ts`.
- Global prefix `/v1`, CORS, helmet, compression.

## Acceptance criteria
- `pnpm --filter api dev` jalan di port yang dikonfigurasi.
- Struktur folder persis TECH-SPEC §1.5.
- Belum ada endpoint bisnis — hanya kerangka.

## Verifikasi
`curl localhost:PORT/v1/health/live` → 200.
