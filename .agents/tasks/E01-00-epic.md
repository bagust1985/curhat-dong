---
id: E01
title: Foundation & Tooling
status: done
tasks: 10
depends_on: []
---

# E01 — Foundation & Tooling

Menyiapkan monorepo, scaffolding 4 app, dan CI. Semua epic lain bergantung ke sini.

**Definition of done:** `pnpm install && pnpm dev` menjalankan web, admin, dan api secara lokal; `pnpm lint && pnpm typecheck && pnpm test` hijau di CI; Postgres + Redis jalan lewat Docker Compose.

**Refs:** TECH-SPEC §1.1, §1.2, §1.5, §9.3, §11
