---
id: E02-T05
epic: E02
title: Model AI — conversations, messages, classifications, usage
status: done
estimate: 0.5d
depends_on: [E02-T02]
refs: [TECH-SPEC §2.2, §10.3, PRD §10]
---

## Scope
`ai_conversations`, `ai_messages`, `ai_classifications`, `ai_usage_events`.

## Acceptance criteria
- `ai_usage_events` mencatat provider, model, operation, tokens in/out, `cost_estimate`, `latency_ms`, `fallback_used`, `prompt_version`.
- `ai_classifications` menyimpan `prompt_version` — wajib untuk audit & rollback (PRD §18).
- `personality_mode` enum 5 nilai (PRD §10).

## Verifikasi
Migration jalan; insert contoh usage event terbaca lengkap.
