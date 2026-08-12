---
id: E06-T03
epic: E06
title: Reaksi pada komentar
status: done
estimate: 0.5d
depends_on: [E06-T02]
refs: [TECH-SPEC §3.2]
---

## Scope
`PUT/DELETE /comments/:id/reactions` memakai tabel `reactions` polymorphic yang sama.

## Acceptance criteria
- Reuse logika E06-T01, jangan duplikasi implementasi.
- Set reaksi sama dengan post.

## Verifikasi
Test agregat reaksi komentar; pastikan tidak ada kode duplikat (satu service dipakai dua target).
