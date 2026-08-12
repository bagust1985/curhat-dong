---
id: E06-T04
epic: E06
title: Tandai komentar "membantu gue" (author only)
status: todo
estimate: 0.5d
depends_on: [E06-T02]
refs: [PRD §9, TECH-SPEC §3.2]
---

## Scope
`POST /comments/:id/helpful` — hanya author post.

## Acceptance criteria
- Hanya author post yang bisa menandai; orang lain 403.
- Menjadi sinyal positif untuk recommendation & helpful score listener.
- Bisa dibatalkan.

## Verifikasi
Test otorisasi; pastikan sinyal masuk ke perhitungan helpful score.
