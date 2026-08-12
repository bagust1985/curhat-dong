---
id: E02
title: Database & Prisma
status: todo
tasks: 9
depends_on: [E01]
---

# E02 — Database & Prisma

Skema PostgreSQL 16 lengkap via Prisma ORM 7. Termasuk entity baru v1.2 (consent, appeals, support resources, retention runs).

**Definition of done:** `prisma migrate dev` menghasilkan skema utuh; seed mengisi 15 kategori; index & FTS terpasang; tidak ada field identitas yang bocor ke tipe public.

**Catatan Prisma 7:** pakai driver adapter `@prisma/adapter-pg` dan `prisma.config.ts` — konvensi Prisma 7, **bukan** Prisma 6.

**Refs:** TECH-SPEC §2, §2.2 (+ entity tambahan v1.2), PRD §20, §25.4
