---
id: E11-T01
epic: E11
title: Socket.IO gateway + auth handshake
status: todo
estimate: 1.5d
depends_on: [E03-T03]
refs: [TECH-SPEC §3.5, §1.1]
---

## Scope
Namespace `/rt`, autentikasi JWT saat handshake, Redis adapter untuk multi-node.

## Acceptance criteria
- Koneksi tanpa token valid ditolak sebelum join event apa pun.
- Token kedaluwarsa saat koneksi hidup → putuskan dengan sopan, client refresh lalu reconnect.
- Redis adapter siap walau MVP single node.

## Verifikasi
Test: connect tanpa token → ditolak; token expired di tengah → disconnect terkontrol.
