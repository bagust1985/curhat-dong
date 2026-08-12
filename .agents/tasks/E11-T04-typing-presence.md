---
id: E11-T04
epic: E11
title: Typing indicator & presence
status: todo
estimate: 1d
depends_on: [E11-T03]
refs: [TECH-SPEC §3.5, DESIGN-REF §2.11]
---

## Scope
`room:typing`, `room:presence` (online/offline), throttling.

## Acceptance criteria
- Typing di-throttle, tidak membanjiri koneksi.
- Presence akurat setelah disconnect mendadak (timeout, bukan menggantung "online" selamanya).
- Presence tidak membocorkan aktivitas user di luar room ini.

## Verifikasi
Test: matikan koneksi paksa → presence berubah offline dalam ambang waktu yang ditentukan.
