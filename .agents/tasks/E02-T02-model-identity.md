---
id: E02-T02
epic: E02
title: Model identity & auth
status: todo
estimate: 1d
depends_on: [E02-T01]
refs: [TECH-SPEC §2.2, TECH-SPEC §7.5, PRD §25.5]
---

## Scope
`users`, `auth_accounts`, `otp_challenges`, `user_profiles`, `anonymous_identities`, `user_devices`, `user_sessions`.

Field v1.2: `users.age_declared_at`, `users.deleted_at`, `users.deletion_mode`, `user_devices.quiet_hours_start/end/timezone`.

## Acceptance criteria
- Email disimpan sebagai `email_hash` (lookup) + `email_encrypted` — **tidak pernah** plaintext.
- `refresh_token_hash` dan `push_token_encrypted`, bukan nilai mentah.
- `push_provider` provider-agnostic (`expo`/`fcm`/`webpush`), **tidak ada** field bernama `fcm_token`.
- `trust_score_internal` tidak pernah masuk tipe public (non-negotiable #4).
- Unique: `auth_accounts(provider, provider_id)`, `user_profiles.alias`.

## Verifikasi
Migration jalan; test memastikan tipe public profile tidak punya field email/provider/trust score.
