---
id: E05-T03
epic: E05
title: Detail post — GET /posts/:id
status: done
estimate: 1d
depends_on: [E05-T02]
refs: [TECH-SPEC §3.2, DESIGN-REF §2.5]
---

## Scope
Detail post + identitas anonim + agregat reaksi + jumlah komentar.

## Acceptance criteria
- Post `held` hanya terlihat oleh authornya, dengan copy "sedang ditinjau".
- Post `removed`/`deleted` → 404 untuk user lain.
- Author id asli tidak pernah dikirim untuk post anonim.
- Post dari user yang saling blokir tidak dapat diakses.

## Verifikasi
Test matriks visibilitas: author vs orang lain × status post × blokir.
