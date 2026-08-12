---
id: E05-T04
epic: E05
title: Hapus post sendiri + kunci komentar
status: done
estimate: 0.5d
depends_on: [E05-T03]
refs: [TECH-SPEC §3.2, DESIGN-REF §2.5]
---

## Scope
`DELETE /posts/:id` (author saja) + toggle `allow_comments`.

## Acceptance criteria
- Hanya author; soft delete agar jejak moderasi tetap ada.
- Menghapus post tidak menghapus `moderation_cases` yang terkait.

## Verifikasi
Test: non-author → 403; case moderasi tetap ada setelah delete.
