---
id: E17-T01
epic: E17
title: Caddy — TLS, HSTS, security headers
status: todo
estimate: 1d
depends_on: [E01-T08]
refs: [TECH-SPEC §7.1, §9.1]
---

## Scope
Caddyfile untuk `curhatdong.com`, `api.curhatdong.com`, `admin.curhatdong.com`.

## Acceptance criteria
- TLS otomatis, HSTS, redirect HTTP→HTTPS, security headers.
- **PostgreSQL & Redis tidak terekspos ke internet publik** (TECH-SPEC §7.1).
- CSP disetel untuk web & admin.

## Verifikasi
Scan SSL Labs + cek header; coba akses port DB dari luar → harus tertutup.
