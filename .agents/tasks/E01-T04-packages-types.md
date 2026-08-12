---
id: E01-T04
epic: E01
title: packages/types — tipe & enum bersama
status: done
estimate: 0.5d
depends_on: [E01-T02]
refs: [TECH-SPEC §3, PRD §7, PRD §9]
---

## Scope
- Enum domain: 11 mood, 4 intent, 6 reaction, 10 kategori report, safety level L0–L3, post status.
- Tipe API envelope `{ data, meta, error }` + katalog `ErrorCode`.
- Tipe event SSE dan WebSocket.

## Acceptance criteria
- Satu sumber kebenaran; web/admin/mobile/api mengimpor dari sini, tidak mendeklarasikan ulang.
- Error code stabil dan terdokumentasi (TECH-SPEC §3).

## Verifikasi
`pnpm typecheck`; grep memastikan tidak ada duplikasi enum mood/intent di app mana pun.
