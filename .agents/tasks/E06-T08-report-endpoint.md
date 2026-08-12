---
id: E06-T08
epic: E06
title: Report — 10 kategori
status: done
estimate: 1d
depends_on: [E06-T02]
refs: [PRD §15, TECH-SPEC §3.2, DESIGN-REF §2.17]
---

## Scope
`POST /reports` untuk post, komentar, pesan, dan user. Kategori: Bullying, Harassment, Sexual, Hate, Threat, Scam, Doxxing, Spam, Dangerous content, Other.

## Acceptance criteria
- Rate limit 20/hari.
- Kategori mendesak (Threat, Dangerous content, Sexual) → prioritas queue lebih tinggi.
- Membuat `moderation_cases` dengan `sla_due_at`.
- Pelapor tidak diberi tahu identitas terlapor; terlapor tidak tahu siapa yang melapor.

## Verifikasi
Test pemetaan kategori → prioritas queue; test rate limit.
