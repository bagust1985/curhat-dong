---
id: E16-T08
epic: E16
title: Listener flow (mobile)
status: todo
estimate: 1.5d
depends_on: [E16-T07, E10-T09]
refs: [DESIGN-REF §2.9, §2.10, §2.20]
---

## Scope
Aktivasi + guidelines, dashboard, match offer (push-driven, TTL 60s), request listener, state istirahat.

## Acceptance criteria
- Match offer bisa muncul dari push saat app di background.
- Countdown TTL akurat walau app baru dibuka dari notifikasi.
- State cap/cooldown bertone apresiatif.

## Verifikasi
Uji offer masuk saat app tertutup → buka dari notifikasi → countdown benar.
