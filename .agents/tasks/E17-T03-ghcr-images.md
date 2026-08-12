---
id: E17-T03
epic: E17
title: Build & push image ke GHCR
status: todo
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
