---
id: E12-T03
epic: E12
title: Web Push + service worker
status: todo
estimate: 1.5d
depends_on: [E12-T02]
refs: [TECH-SPEC §1.1, §6.1]
---

## Scope
VAPID, service worker, alur permission, kirim via Web Push.

## Acceptance criteria
- Permission diminta pada momen yang tepat, bukan saat halaman pertama dibuka.
- Payload mengikuti aturan generik yang sama dengan push mobile.
- Subscription kedaluwarsa dibersihkan.

## Verifikasi
Manual di Chrome & Firefox; verifikasi payload notifikasi.
