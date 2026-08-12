---
id: E03-T06
epic: E03
title: Google OAuth (web + mobile)
status: todo
estimate: 1.5d
depends_on: [E03-T04]
refs: [TECH-SPEC §5.3, PRD §4]
---

## Scope
- `POST /auth/google` — verifikasi ID token/auth code **di backend**.
- Tautkan ke user berdasarkan `email_hash` bila sudah ada.

## Acceptance criteria
- **Client tidak pernah menentukan status user sendiri** (TECH-SPEC §5.3).
- Signature & audience ID token diverifikasi ke Google, bukan sekadar di-decode.
- Provider id disimpan private, tidak pernah keluar di API publik.

## Verifikasi
Test dengan token tidak valid/kedaluwarsa/audience salah → semuanya ditolak.
