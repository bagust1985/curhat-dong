---
id: E11-T06
epic: E11
title: Safety notice & screenshot protection
status: todo
estimate: 0.5d
depends_on: [E11-T03]
refs: [PRD §15, DESIGN-REF §2.11]
---

## Scope
Notice sekali di awal room: "Percakapan ini dipantau sistem keamanan otomatis. Jaga privasimu." + FLAG_SECURE di Android.

## Acceptance criteria
- Notice muncul sekali per room, jujur soal pemantauan otomatis.
- FLAG_SECURE aktif di Android bila didukung.
- **Jangan menjanjikan screenshot 100% mustahil** (PRD §15) — nyatakan apa adanya.

## Verifikasi
Manual di perangkat Android; cek notice hanya muncul sekali.
