---
id: E02-T08
epic: E02
title: Index strategy + full-text search
status: todo
estimate: 1d
depends_on: [E02-T03, E02-T04, E02-T06]
refs: [TECH-SPEC §2.4]
---

## Scope
- Seluruh index minimum TECH-SPEC §2.4.
- Partial index `WHERE status = 'published'` untuk feed.
- `tsvector` + GIN untuk pencarian (bahasa Indonesia).

## Acceptance criteria
- Query feed 3 tab memakai index (bukan seq scan) pada data uji ≥50k baris.
- FTS mengembalikan hasil relevan untuk kata berimbuhan Indonesia.
- Tidak memakai Elasticsearch (out of scope Phase 1).

## Verifikasi
`EXPLAIN ANALYZE` tiap query feed; catat plan sebelum/sesudah index di PR.
