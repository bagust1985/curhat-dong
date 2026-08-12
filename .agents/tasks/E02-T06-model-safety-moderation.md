---
id: E02-T06
epic: E02
title: Model safety, moderation & appeal
status: done
estimate: 1d
depends_on: [E02-T02]
refs: [TECH-SPEC §2.2, BAGIAN 19, PRD §15, §15.4]
---

## Scope
`safety_events`, `reports`, `moderation_cases`, `moderation_actions`, `moderation_appeals` (v1.2), `blocked_users`, `trust_scores`, `audit_logs`.

Field v1.2: `moderation_actions.is_appealable/appealed`, `moderation_cases.sla_due_at`.

## Acceptance criteria
- `blocked_users` composite unique (blocker, blocked).
- `moderation_appeals.reviewer_id` wajib ≠ moderator pemutus aksi — dijaga **check constraint di database**, bukan hanya kode.
- `moderation_cases.queue` enum `critical|high|medium|low` + `sla_due_at` dihitung saat pembuatan.
- `is_appealable` true untuk `remove|warn|mute|suspend|ban`; false untuk `approve|escalate`.

## Verifikasi
Test: insert appeal dengan reviewer == decider ditolak di level database.
