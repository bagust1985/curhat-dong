# CURHAT DONG — Project Context untuk Claude Code

Emotional social network Indonesia (18+): anonymous curhat + human listener + DONG AI.
North Star Metric: **Felt Heard Rate**. Domain: curhatdong.com / api.curhatdong.com / admin.curhatdong.com.

## Dokumen acuan (WAJIB dibaca sebelum implementasi)
- `.agents/1-PRD.md` — Master PRD v1.0 + catatan review (compliance PSE/UU PDP, crisis protocol L3, listener guidelines, AI cost guard)
- `.agents/2-TECH-SPEC.md` — Tech Spec v1.1 (LOCKED, source of truth teknis)
- `.agents/3-DESIGN-REFERENCE.md` — semua pages, functions, dan shared components
- `.agents/tasks/` — task breakdown (generate via workflow di bawah jika masih kosong)

## Stack LOCKED (jangan diganti tanpa update tech spec)
- Monorepo: pnpm + Turborepo
- Web/Admin: Next.js 16.3.x, React 19.x, Tailwind 4.x, shadcn/ui
- Mobile: Expo SDK 57, Expo Router, NativeWind 4.x + **Tailwind 3.4.x khusus apps/mobile**
- API: NestJS 11.x (modular monolith) + worker BullMQ terpisah
- Data: PostgreSQL 16 + Prisma ORM 7.x (driver adapter `@prisma/adapter-pg`, `prisma.config.ts` — pakai konvensi Prisma 7, BUKAN Prisma 6), Redis 7
- Auth: Email OTP (Resend adapter) + Google OAuth + JWT 15m + rotating refresh (family + reuse detection); web pakai HttpOnly cookie, mobile pakai Expo SecureStore
- Push: provider-agnostic (`push_provider` + `push_token_encrypted`); default Expo Push Service → FCM
- Bot protection: Cloudflare Turnstile (verifikasi server-side)
- AI: internal AI Gateway provider-agnostic + model routing cheap/advanced + `ai_usage_events` cost logging
- Infra: Vultr VPS + Docker Compose + Caddy + GHCR + GitHub Actions

## Aturan non-negotiable
1. **Safety fallback**: AI timeout + low-risk → publish L1 + re-analysis; AI timeout + local high-risk signal → **HOLD** + moderation Critical/High. Outage AI provider TIDAK BOLEH jadi safety bypass.
2. Level 3 (immediate risk): JANGAN auto-punish user; tampilkan supportive intervention + hotline resources; buat moderation case Critical.
3. Push notification & Sentry TIDAK PERNAH memuat isi curhat/chat/AI conversation.
4. Public API tidak pernah mengekspos email, provider ID, phone, atau internal risk/trust score.
5. Semua halaman curhat = noindex. Redis bukan source of truth (Postgres yang utama).
6. Dependency dipin via `pnpm-lock.yaml` — dilarang `"latest"` di production.
7. Migration destructive wajib review manual; production hanya `prisma migrate deploy`.
8. Bahasa UI: Indonesia, tone hangat non-klinis (lihat design reference §0).

## Workflow skill (.agents pipeline)
- Buat/pecah task: bilang "buat task" / "breakdown pekerjaan" → tasks ke `.agents/tasks/`
- Eksekusi: "kerjakan task" → implement per task, branch per feature
- Selesai coding: "verifikasi" → automated (unit/integration) + manual testing
- Setiap task selesai: update status di file task-nya

## Konvensi
- Commit: conventional commits (feat/fix/chore/refactor + scope module)
- Semua kode & komentar: English; copy/string UI: Bahasa Indonesia
- Zod validation di boundary API; error response punya stable `code`
- Test minimal: unit untuk safety mapping, auth token rotation, matching filter, rate limit
