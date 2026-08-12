---
id: E10-T05
epic: E10
title: Matching — filter kandidat
status: done
estimate: 1.5d
depends_on: [E10-T04]
refs: [TECH-SPEC §4.5, CLAUDE.md test minimal]
---

## Scope
Filter: topic overlap, bahasa, **tidak saling blokir**, safety status OK, kapasitas konkuren, listener enabled, tidak sedang cooldown.

## Acceptance criteria
- Blokir dua arah dihormati mutlak (E03-T11).
- Listener yang kena cap harian atau cooldown dikeluarkan dari kandidat.
- Listener dengan `safety_status` bermasalah tidak pernah dicocokkan.
- Requester tidak pernah dicocokkan dengan dirinya sendiri.

## Verifikasi
**Unit test matching filter wajib** (CLAUDE.md) — seluruh kondisi filter, termasuk blokir dua arah.
