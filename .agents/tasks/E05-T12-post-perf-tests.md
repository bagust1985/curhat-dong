---
id: E05-T12
epic: E05
title: Test performa feed (p95 < 500ms)
status: done
estimate: 1d
depends_on: [E05-T09]
refs: [TECH-SPEC §8.3]
---

## Scope
Benchmark endpoint feed dengan dataset ≥50k post.

## Acceptance criteria
- p95 < 500 ms untuk 3 tab feed.
- Tidak ada N+1 query.
- `EXPLAIN` memastikan index dipakai.

## Verifikasi
Script benchmark dijalankan di CI nightly; hasil dicatat di PR.
