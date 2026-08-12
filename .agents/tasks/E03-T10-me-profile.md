---
id: E03-T10
epic: E03
title: Endpoint /me dan profil publik
status: todo
estimate: 1d
depends_on: [E03-T03]
refs: [TECH-SPEC §3.1, PRD §16]
---

## Scope
- `GET/PATCH /me`; `GET /users/:alias` (public-safe).
- Edit alias, avatar, bio dengan validasi.

## Acceptance criteria
- Profil publik hanya: alias, avatar, bio, badge listener, joined date, helpful reactions.
- **Tidak pernah** mengembalikan email, provider id, phone, trust/risk score (non-negotiable #4).
- Ganti alias dicek keunikannya + rate limit.

## Verifikasi
Test kontrak: snapshot response publik gagal kalau ada field terlarang yang bocor.
