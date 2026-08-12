---
id: E10-T07
epic: E10
title: Offer lifecycle — TTL 60s, maksimum 5 kandidat
status: todo
estimate: 1.5d
depends_on: [E10-T06]
refs: [TECH-SPEC §4.5, DESIGN-REF §2.9c]
---

## Scope
Tawarkan ke kandidat #1 → accept / decline / timeout 60 detik → lanjut kandidat berikutnya, maksimal 5 percobaan.

## Acceptance criteria
- Offer memuat topik + mood + emosi **tanpa identitas requester**.
- TTL ditegakkan server-side (jangan percaya countdown client).
- Race dua listener accept bersamaan → hanya satu berhasil, yang lain dapat pesan sopan.
- Accept → buat room + session (E11).

## Verifikasi
Test race accept bersamaan; test timeout melanjutkan ke kandidat berikutnya.
