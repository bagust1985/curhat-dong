---
id: E03-T03
epic: E03
title: JWT access token + auth guard
status: done
estimate: 1d
depends_on: [E03-T02]
refs: [TECH-SPEC §5.1]
---

## Scope
- Access token TTL 15 menit, payload minimum (internal user id + role), tanpa PII.
- Guard + decorator `@CurrentUser`.

## Acceptance criteria
- Payload token **tidak memuat** email, provider id, atau trust score (non-negotiable #4).
- Token kedaluwarsa → 401 dengan `code` yang bisa dibedakan dari 401 lain.

## Verifikasi
Unit test payload & expiry; test guard menolak token tanpa/rusak.
