---
id: E14-T11
epic: E14
title: Category management
status: done
estimate: 0.5d
depends_on: [E14-T02]
refs: [PRD §16, DESIGN-REF §3.7]
---

## Scope
CRUD kategori: nama, slug, icon picker, display order (drag), archive.

## Acceptance criteria
- Archive, bukan hard delete — post lama harus tetap punya kategori.
- Perubahan meng-invalidate cache kategori (E05-T01).
- Slug unik dan stabil.

## Verifikasi
Test: archive kategori yang punya post → post tetap terbaca.
