---
id: E02-T09
epic: E02
title: Seed data — kategori, feature flags, app configs
status: done
estimate: 0.5d
depends_on: [E02-T07, E02-T08]
refs: [PRD §16, §25.7, TECH-SPEC §18.5]
---

## Scope
- 15 kategori (Relationship, Marriage, Family, Work, Career, Finance, Friendship, Loneliness, Self Confidence, College, Parenting, Business, Loss, Random, Positive Story).
- Feature flags default; app_configs: rate limit, SLA moderasi, kuota AI, quiet hours.
- `support_resources`: **struktur** + placeholder bertanda jelas.

## Acceptance criteria
- Seed idempoten (aman dijalankan ulang).
- Nilai default sama dengan rekap PRD §25.7.
- `support_resources` seed **tidak** berisi nomor hotline karangan. Entri placeholder harus `is_active=false` dengan catatan `PERLU VERIFIKASI SUMBER RESMI` — hotline yang salah lebih berbahaya daripada kosong.

## Verifikasi
Jalankan seed 2×; hitungan tidak berubah. Query resource aktif region ID → kosong sampai data asli dimasukkan.
