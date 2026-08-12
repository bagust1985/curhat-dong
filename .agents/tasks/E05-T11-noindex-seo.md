---
id: E05-T11
epic: E05
title: Noindex & privacy-first SEO
status: done
estimate: 0.5d
depends_on: [E05-T03]
refs: [PRD §13, CLAUDE.md non-negotiable #5]
---

## Scope
`noindex` untuk semua halaman curhat, `robots.txt`, meta tag, dan header.

## Acceptance criteria
- Seluruh halaman post/feed/room/profile **noindex** by default.
- Hanya landing page & halaman legal yang boleh terindeks.
- Tidak ada isi curhat di meta description atau OG tag.

## Verifikasi
Crawl lokal seluruh route → tidak ada halaman curhat tanpa noindex. Jadikan test otomatis.
