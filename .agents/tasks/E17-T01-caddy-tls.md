---
id: E17-T01
epic: E17
title: Caddy — TLS, HSTS, security headers
status: in_progress
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

## Catatan implementasi

- `infrastructure/Caddyfile` untuk tiga domain. TLS otomatis; yang ditulis di
  situ justru yang **tidak** otomatis: HSTS 2 tahun + preload, security header,
  dan CSP terpisah untuk web (Turnstile + Google saja) dan admin (lebih ketat,
  `no-store`).
- **Postgres & Redis tidak muncul sama sekali di file ini** — bukan diblokir,
  memang tidak ada rute ke sana. Itu satu-satunya versi yang tidak bisa
  dibatalkan oleh satu edit firewall.
- **Belum diverifikasi**: SSL Labs, cek header dari luar, dan uji port DB
  tertutup — butuh VPS dan domain yang sudah mengarah.
