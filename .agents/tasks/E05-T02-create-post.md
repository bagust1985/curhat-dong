---
id: E05-T02
epic: E05
title: Create curhat — POST /posts
status: done
estimate: 1.5d
depends_on: [E05-T01, E04-T04]
refs: [PRD §7, TECH-SPEC §4.1, DESIGN-REF §2.6]
---

## Scope
Title opsional, body, category, mood (11), intent (4), anonymity mode, allow_comments, request_listener. Simpan `pending_analysis` → enqueue `analyze-post`.

## Acceptance criteria
- Validasi Zod di boundary; body wajib, panjang dibatasi.
- Rate limit 10 post/hari.
- Post **tidak langsung published** — masuk `pending_analysis` dulu (TECH-SPEC §4.1).
- `noindex` pada seluruh halaman post (non-negotiable #5).

## Verifikasi
Integration: create → status `pending_analysis` + job masuk queue.
