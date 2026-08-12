---
id: E01-T09
epic: E01
title: CI GitHub Actions — lint, typecheck, test
status: done
estimate: 1d
depends_on: [E01-T02]
refs: [TECH-SPEC §9.3]
---

## Scope
- Workflow di PR & push `main`: install (cache pnpm) → lint → typecheck → unit test.
- Turborepo remote/local cache agar CI tidak lambat sejak awal.

## Acceptance criteria
- CI gagal kalau salah satu tahap gagal — tidak ada `continue-on-error` di tahap wajib.
- Job build image ada tapi belum deploy (deploy di E17).

## Verifikasi
Buka PR percobaan berisi error tipe → CI harus merah.
