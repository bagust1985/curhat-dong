---
id: E06-T01
epic: E06
title: 6 emotional reaction pada post
status: done
estimate: 1d
depends_on: [E05-T03]
refs: [PRD §9, TECH-SPEC §3.2]
---

## Scope
`PUT/DELETE /posts/:id/reactions` — Aku ngerti, Peluk virtual, Aku dengerin, Aku pernah di situ, Tetap kuat, Cerita lagi.

## Acceptance criteria
- Reaksi bersifat kata empati, **bukan Like** — tidak ada satu tombol dominan.
- Satu user boleh beberapa jenis reaksi, tapi tidak duplikat per jenis.
- Reaction count boleh disembunyikan (PRD §9) — API menyediakan agregat, UI yang memutuskan menampilkan atau tidak.
- Reaksi **tidak** menaikkan `response_count` (itu hanya untuk respons manusia bermakna).

## Verifikasi
Test: reaksi ganda ditolak; unset bekerja; `response_count` tidak berubah.
