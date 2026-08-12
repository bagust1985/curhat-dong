---
id: E03-T12
epic: E03
title: Test suite keamanan auth
status: done
estimate: 1d
depends_on: [E03-T04, E03-T06, E03-T07, E03-T08]
refs: [CLAUDE.md test minimal, TECH-SPEC BAGIAN 5]
---

## Scope
Kumpulkan skenario keamanan auth menjadi satu suite yang dijalankan di CI.

## Acceptance criteria
Menutup minimal: rotasi refresh, reuse detection, OTP expiry/consumed/enumeration, rate limit OTP, penolakan ID token Google tidak valid, larangan refresh token di localStorage, dan bocornya PII di response `/me` & profil publik.

## Verifikasi
`pnpm test` di CI; suite ini **wajib hijau** sebelum E03 dianggap selesai.
