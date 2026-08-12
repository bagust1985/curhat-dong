---
id: E14-T01
epic: E14
title: Login admin + MFA TOTP
status: todo
estimate: 1.5d
depends_on: [E03-T04]
refs: [TECH-SPEC §7.4, DESIGN-REF §3.1]
---

## Scope
`POST /admin/auth/login`, `POST /admin/auth/mfa/verify`, alur setup TOTP pertama kali, lockout.

## Acceptance criteria
- **MFA wajib**, bukan opsional (TECH-SPEC §7.4).
- Sesi admin lebih pendek dari sesi user.
- Re-auth untuk aksi sangat sensitif (ban, akses konten privat, ubah AI config).
- Lockout setelah percobaan gagal berulang.

## Verifikasi
Test: login tanpa MFA tidak menghasilkan sesi valid; test lockout.
