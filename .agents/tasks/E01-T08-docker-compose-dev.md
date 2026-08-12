---
id: E01-T08
epic: E01
title: docker-compose.dev — Postgres 16 + Redis 7
status: done
estimate: 0.5d
depends_on: [E01-T01]
refs: [TECH-SPEC §11.2, TECH-SPEC §9.2]
---

## Scope
- `infrastructure/docker-compose.dev.yml`: postgres:16, redis:7, volume persisten.
- Healthcheck untuk keduanya.

## Acceptance criteria
- Postgres & Redis **tidak** terekspos ke jaringan publik, hanya localhost dev.
- Data bertahan setelah `docker compose restart`.

## Verifikasi
`docker compose -f infrastructure/docker-compose.dev.yml up -d` lalu `pg_isready` dan `redis-cli ping`.
