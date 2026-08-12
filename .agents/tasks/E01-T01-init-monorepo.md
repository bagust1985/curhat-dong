---
id: E01-T01
epic: E01
title: Inisialisasi monorepo pnpm + Turborepo
status: done
estimate: 0.5d
depends_on: []
refs: [TECH-SPEC §1.1, TECH-SPEC §1.5]
---

## Scope
- `git init`, `.gitignore`, `pnpm-workspace.yaml`, `turbo.json`, root `package.json`.
- Pin pnpm via field `packageManager`; pin Node LTS via `.nvmrc` + `engines`.
- Struktur folder kosong sesuai TECH-SPEC §1.5 (`apps/*`, `packages/*`, `infrastructure/*`).

## Acceptance criteria
- `pnpm install` sukses di repo bersih.
- `turbo run build` mengenali seluruh workspace (boleh no-op).
- `pnpm-lock.yaml` ter-commit.
- Tidak ada `"latest"` di `package.json` mana pun (non-negotiable #6).

## Out of scope
Scaffolding isi app (E01-T05..T07).

## Verifikasi
`rm -rf node_modules && pnpm install && turbo run build --dry-run`
