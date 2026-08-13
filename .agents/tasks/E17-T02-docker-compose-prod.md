---
id: E17-T02
epic: E17
title: docker-compose produksi
status: in_progress
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

## Catatan implementasi

- Sembilan service: caddy, api, worker, web, admin, postgres, redis,
  uptime-kuma, dozzle.
- **Postgres & Redis tanpa `ports:` sama sekali** (bukan bind loopback) —
  hanya lewat network internal compose.
- Worker pakai **image yang sama dengan API**, beda command saja.
- Healthcheck API menembak `/health/ready`, bukan `live`: Caddy tidak boleh
  mengirim traffic ke API yang hidup tapi tidak bisa mencapai database.
- Worker sengaja **tanpa healthcheck HTTP** — dia memang tidak membuka port.
- uptime-kuma & dozzle di-bind `127.0.0.1` — dashboard monitoring di internet
  publik itu daftar endpoint kamu berikut jam lemahnya.
- `IMAGE_TAG` wajib SHA; `latest` tidak pernah dipakai pipeline.
- **Belum dijalankan di VPS.**
