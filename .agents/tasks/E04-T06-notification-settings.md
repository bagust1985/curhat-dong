---
id: E04-T06
epic: E04
title: Notification settings + quiet hours
status: done
estimate: 1d
depends_on: [E04-T05]
refs: [PRD §14, TECH-SPEC §4.7, DESIGN-REF §2.16]
---

## Scope
- `GET/PATCH /me/notification-settings` — granular per tipe (social/response/listener/AI) × channel (push/in-app).
- Quiet hours default 22.00–07.00 waktu lokal + timezone device.

## Acceptance criteria
- Default sesuai PRD §25.7.
- Notifikasi **safety/akun tetap dikirim** saat quiet hours; listener nudge dan sosial tidak.
- User bisa mengubah atau mematikan quiet hours.

## Verifikasi
Unit test: hitung apakah sebuah notifikasi boleh dikirim pada jam & tipe tertentu (termasuk kasus lintas tengah malam).
