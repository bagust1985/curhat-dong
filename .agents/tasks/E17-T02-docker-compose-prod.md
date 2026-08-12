---
id: E17-T02
epic: E17
title: docker-compose produksi
status: todo
estimate: 1.5d
depends_on: [E17-T01]
refs: [TECH-SPEC §9.1, §9.2]
---

## Scope
Service: caddy, web, admin, api, worker, postgres, redis, uptime-kuma, dozzle.

## Acceptance criteria
- Healthcheck di setiap service utama + restart policy.
- Volume persisten Postgres; konfigurasi Redis sesuai kebutuhan queue.
- Container non-root bila image mendukung.
- **Tag image immutable** — jangan deploy `latest` sebagai satu-satunya referensi (TECH-SPEC §9.2).

## Verifikasi
Deploy ke VPS staging; matikan satu service → restart otomatis + healthcheck bekerja.
