---
id: E01-T03
epic: E01
title: packages/config — env schema tervalidasi
status: done
estimate: 1d
depends_on: [E01-T02]
refs: [TECH-SPEC §12, TECH-SPEC §7.2]
---

## Scope
- Skema Zod untuk seluruh grup env di TECH-SPEC §12, dipisah tegas **server** vs **client**.
- Fail fast saat boot kalau env wajib hilang atau salah format.
- `.env.example` tanpa nilai rahasia.

## Acceptance criteria
- Secret server tidak pernah bisa terekspos lewat `NEXT_PUBLIC_*` — dijaga oleh tipe, bukan konvensi.
- Boot dengan env kurang → error jelas menyebut variabel mana, bukan stack trace.
- `.env` masuk `.gitignore`.

## Verifikasi
Unit test: env valid lolos; env kurang/salah tipe melempar error yang menyebut nama variabel.
