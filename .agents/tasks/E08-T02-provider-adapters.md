---
id: E08-T02
epic: E08
title: Adapter provider (Anthropic, OpenAI, local-compatible)
status: todo
estimate: 1.5d
depends_on: [E08-T01]
refs: [TECH-SPEC §1.1, §4.4]
---

## Scope
Implementasi adapter + normalisasi error/latency/token usage.

## Acceptance criteria
- Bentuk error diseragamkan (timeout, rate limit, invalid) supaya fallback E07-T05 bisa memutuskan.
- Streaming didukung untuk `chat`.
- Token usage dilaporkan seragam antar provider.

## Verifikasi
Contract test yang sama dijalankan ke setiap adapter.
