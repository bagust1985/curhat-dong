---
id: E06-T02
epic: E06
title: Komentar & reply (nested 1 level)
status: todo
estimate: 1.5d
depends_on: [E06-T01]
refs: [PRD §9, TECH-SPEC §3.2, DESIGN-REF §2.5]
---

## Scope
`GET/POST /posts/:id/comments` dengan cursor; reply `parent_id` maksimal 1 level.

## Acceptance criteria
- Reply ke reply **ditolak** (maksimal 1 level).
- Rate limit 60 komentar/jam.
- Komentar melewati pipeline safety yang sama seperti post.
- Komentar menaikkan `response_count` post → memicu Felt Heard (E06-T05).
- Komentar tidak muncul kalau `allow_comments=false` atau komentar dikunci.

## Verifikasi
Test kedalaman nesting, rate limit, dan pengaruhnya ke `response_count`.
