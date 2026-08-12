---
id: E04-T04
epic: E04
title: Anonymous identity per post (Anonymous #A7392)
status: todo
estimate: 1d
depends_on: [E04-T03, E02-T03]
refs: [PRD §4, TECH-SPEC §4.7]
---

## Scope
- Mode anonymity per post: alias tetap vs kode anonim per post.
- `anonymous_identities` menyimpan relasi post↔user.

## Acceptance criteria
- Kode anonim **tidak bisa** dikorelasikan antar post oleh user lain.
- Backend tetap menyimpan relasi untuk moderasi/legal, **tidak pernah** diekspos ke API publik.
- Post anonim tetap bisa dimoderasi dan ditelusuri ke akun oleh admin (dengan audit).

## Verifikasi
Test: 2 post anonim dari user sama → kode berbeda, response publik tidak mengandung petunjuk keterkaitan.
