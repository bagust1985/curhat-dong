---
id: E17-T06
epic: E17
title: Uptime Kuma + alert ops
status: todo
estimate: 1d
depends_on: [E17-T02]
refs: [TECH-SPEC §10.2]
---

## Scope
Monitor API, Web, Admin lewat `/health/live` & `/health/ready`; alert Telegram/ops channel.

## Acceptance criteria
- `ready` mengecek dependency minimum untuk menerima traffic.
- Alert sampai ke kanal yang benar-benar dibaca orang.
- Dozzle terpasang untuk container log MVP.

## Verifikasi
Matikan API → alert masuk dalam ambang waktu yang ditentukan.
