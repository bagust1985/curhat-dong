---
id: E01-T02
epic: E01
title: Shared tsconfig, ESLint, Prettier
status: done
estimate: 0.5d
depends_on: [E01-T01]
refs: [TECH-SPEC §1.1, CLAUDE.md konvensi]
---

## Scope
- `packages/config/tsconfig` base + varian next/nest/expo.
- ESLint flat config + Prettier, satu sumber untuk semua workspace.
- Script root: `lint`, `typecheck`, `format`.

## Acceptance criteria
- TypeScript 5.x `strict: true` di semua app.
- Rule yang melarang `any` implisit aktif.
- `apps/mobile` boleh punya override sendiri (Tailwind 3.4.x, lihat TECH-SPEC §1.2).

## Verifikasi
`pnpm lint && pnpm typecheck` hijau di repo kosong.
