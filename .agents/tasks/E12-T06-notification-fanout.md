---
id: E12-T06
epic: E12
title: Job notification fanout
status: done
estimate: 1d
depends_on: [E12-T05]
refs: [TECH-SPEC §1.4]
---

## Scope
Job `notification-fanout` + `push-notification` di worker; hormati preferensi granular user.

## Acceptance criteria
- Idempoten — retry tidak mengirim notifikasi ganda.
- Menghormati setting per tipe × channel.
- Kegagalan satu device tidak menggagalkan yang lain.

## Verifikasi
Test: retry job → user hanya menerima satu notifikasi.
