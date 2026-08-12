---
id: E03-T11
epic: E03
title: Block / unblock user
status: todo
estimate: 1d
depends_on: [E03-T10]
refs: [PRD §15, TECH-SPEC §4.7]
---

## Scope
- `POST/DELETE /users/:id/block`; daftar blokir di Settings.
- Helper query blokir dua arah untuk dipakai feed, komentar, matching.

## Acceptance criteria
- Block berlaku **dua arah**: feed, visibilitas komentar, listener matching, interaksi privat.
- Yang diblokir tidak mendapat notifikasi bahwa dirinya diblokir.
- Blokir memutus match/room yang sedang berjalan dengan aman.

## Verifikasi
Unit test filter matching (wajib, CLAUDE.md); integration: A blokir B → keduanya saling hilang di 4 permukaan.
