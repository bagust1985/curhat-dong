---
id: E17-T03
epic: E17
title: Build & push image ke GHCR
status: in_progress
estimate: 1d
depends_on: [E01-T09]
refs: [TECH-SPEC §9.3]
---

## Scope
Dockerfile multi-stage untuk web, admin, api, worker; push ke GHCR dengan tag versi.

## Acceptance criteria
- Image ramping (multi-stage, tanpa devDependencies).
- Tag berisi commit SHA, bukan hanya `latest`.
- **Tidak ada secret yang ter-bake ke image.**

## Verifikasi
Inspect layer image untuk memastikan tidak ada `.env` atau kunci; ukur ukuran image.

## Catatan implementasi

- Dua Dockerfile multi-stage: `api.Dockerfile` (API + worker) dan
  `next.Dockerfile` (web & admin, dibedakan `ARG APP`).
- Next.js `output: 'standalone'` + `outputFileTracingRoot` ke root repo, supaya
  layer runtime cuma bawa server hasil trace, bukan seluruh node_modules.
- Non-root (uid 1001) di semua image runtime.
- **Tidak ada `.env` yang di-COPY di stage mana pun.** Secret yang terpanggang
  di satu layer tetap ada di registry selamanya, walau layer di atasnya
  menghapusnya.
- Workflow punya langkah yang **menggagalkan build** kalau image berisi `.env`,
  `id_rsa`, atau `*.pem` — lebih murah daripada merotasi semua kredensial sekali.
- **Build image belum pernah dijalankan** (butuh runner/registry).
