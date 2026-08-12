---
id: E17-T05
epic: E17
title: Sentry + scrubbing data sensitif
status: todo
estimate: 1.5d
depends_on: [E01-T09]
refs: [TECH-SPEC §10.1, CLAUDE.md non-negotiable #3]
---

## Scope
Sentry di web, admin, mobile, api, worker + aturan scrubbing.

## Acceptance criteria
- Scrub: Authorization, Cookie, email, chat content, post body, AI conversation content, push token.
- **Isi curhat tidak pernah dikirim ke Sentry** (non-negotiable #3) — termasuk lewat breadcrumb, request body, dan pesan error.
- Scrubbing diverifikasi dengan error sungguhan, bukan diasumsikan dari config.

## Verifikasi
**Test wajib**: picu error saat membuat post → cek event Sentry tidak memuat body post. Ini menjaga non-negotiable #3.
