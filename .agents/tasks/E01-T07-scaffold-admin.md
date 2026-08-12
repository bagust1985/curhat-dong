---
id: E01-T07
epic: E01
title: Scaffold apps/admin (Next 16.3)
status: done
estimate: 0.5d
depends_on: [E01-T06]
refs: [TECH-SPEC §1.1, DESIGN-REF §3]
---

## Scope
- Next.js 16.3.x + Tailwind 4 + shadcn/ui, reuse `packages/ui`.
- Layout sidebar 14 menu sesuai DESIGN-REF §1 (termasuk Appeals & Support Resources).
- Shell saja, halaman kosong.

## Acceptance criteria
- Admin app terpisah, siap dipasang di `admin.curhatdong.com`.
- Semua route admin di belakang guard (implementasi auth di E14).

## Verifikasi
`pnpm --filter admin dev` → sidebar tampil, seluruh route dapat dibuka.
