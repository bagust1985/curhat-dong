---
id: E08-T01
epic: E08
title: Interface AIProvider + registry
status: todo
estimate: 1d
depends_on: [E02-T05]
refs: [TECH-SPEC §4.4]
---

## Scope
`packages/ai`: interface `moderate`, `classifyEmotion`, `detectIntent`, `assessRisk`, `chat` (AsyncIterable).

## Acceptance criteria
- Domain code bergantung **hanya** pada interface.
- **API key provider tidak pernah dikirim ke client** (TECH-SPEC §4.4).
- Registry memilih provider dari config runtime.

## Verifikasi
Unit test dengan provider palsu; grep memastikan tidak ada SDK provider yang diimpor di luar `packages/ai`.
