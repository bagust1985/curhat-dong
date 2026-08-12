---
id: E03-T05
epic: E03
title: Penyimpanan token — cookie HttpOnly (web) & SecureStore (mobile)
status: todo
estimate: 1d
depends_on: [E03-T04]
refs: [TECH-SPEC §5.1]
---

## Scope
- Web: refresh token di cookie `HttpOnly` + `Secure` + `SameSite`.
- Mobile: kontrak response yang cocok untuk Expo SecureStore.

## Acceptance criteria
- **Refresh token tidak pernah masuk `localStorage`** (TECH-SPEC §5.1).
- Cookie di-scope ke domain API, CSRF dipertimbangkan untuk endpoint yang mengubah state.
- Logout benar-benar membersihkan cookie.

## Verifikasi
Cek di browser: refresh token tidak terlihat dari JS. Test integrasi alur cookie.
