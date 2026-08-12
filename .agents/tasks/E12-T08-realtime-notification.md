---
id: E12-T08
epic: E12
title: Event WebSocket notification:new
status: done
estimate: 0.5d
depends_on: [E12-T07, E11-T01]
refs: [TECH-SPEC §3.5]
---

## Scope
Kirim `notification:new` lewat WS untuk user yang sedang online.

## Acceptance criteria
- User online mendapat update in-app tanpa perlu push.
- Tidak menghasilkan notifikasi ganda (WS + push) untuk peristiwa yang sama.
- Payload tetap generik.

## Verifikasi
Test: user online → hanya WS; user offline → push.
