# CURHAT DONG — Ringkasan Pengerjaan

> Laporan berjalan. Diperbarui setiap epic selesai.
> Terakhir: **12 Agustus 2026** — E01 selesai.

## Status Keseluruhan

| Epic | Nama | Task | Status |
|---|---|---|---|
| **E01** | Foundation & Tooling | 10/10 | ✅ **Selesai** |
| E02 | Database & Prisma | 0/9 | ⬜ Belum |
| E03 | Auth & Session | 0/12 | ⬜ Belum |
| E04 | Onboarding, Consent & Identity | 0/8 | ⬜ Belum |
| E05 | Post & Feed | 0/12 | ⬜ Belum |
| E06 | Interaction & Felt Heard | 0/8 | ⬜ Belum |
| E07 | Safety Engine & Moderation Core | 0/14 | ⬜ Belum |
| E08 | AI Gateway | 0/9 | ⬜ Belum |
| E09 | DONG AI | 0/8 | ⬜ Belum |
| E10 | Listener & Matching | 0/11 | ⬜ Belum |
| E11 | Private Chat Room | 0/9 | ⬜ Belum |
| E12 | Notification | 0/9 | ⬜ Belum |
| E13 | Search | 0/4 | ⬜ Belum |
| E14 | Admin Panel | 0/15 | ⬜ Belum |
| E15 | Web UI | 0/17 | ⬜ Belum |
| E16 | Mobile (Android) | 0/13 | ⬜ Belum |
| E17 | Compliance, Deploy & Observability | 0/14 | ⬜ Belum |

**Progres: 10 / 182 task (5,5%).**

---

## E01 — Foundation & Tooling ✅

Monorepo, 4 app ter-scaffold, CI, dan infra dev. Semua epic lain bergantung ke sini.

| Task | Hasil |
|---|---|
| E01-T01 | Monorepo pnpm 10 + Turborepo 2, git init, catalog versi terpusat |
| E01-T02 | tsconfig base/next/nest/expo, ESLint flat config, Prettier |
| E01-T03 | `packages/config` — env schema Zod, server vs client dipisah |
| E01-T04 | `packages/types` — enum domain, API envelope, event SSE/WS |
| E01-T05 | `apps/api` NestJS 11, 18 module (termasuk `profiles`) |
| E01-T06 | `apps/web` Next 16.3 + Tailwind 4 + design token 3 tema |
| E01-T07 | `apps/admin` Next 16.3 + sidebar 13 menu |
| E01-T08 | `docker-compose.dev.yml` Postgres 16 + Redis 7 |
| E01-T09 | GitHub Actions: lint → typecheck → test + 2 policy guard |
| E01-T10 | Common layer API: envelope, ErrorCode stabil, Zod pipe, health |

### Hasil verifikasi

```
pnpm lint       7/7 workspace   hijau
pnpm typecheck  7/7 workspace   hijau
pnpm test       48 test         hijau
next build      web + admin     sukses
```

Pemecahan test: `@curhat/web` 17 · `@curhat/types` 10 · `@curhat/config` 9 · `@curhat/api` 8 · `@curhat/admin` 4.

API diuji hidup:

| Endpoint | Hasil |
|---|---|
| `GET /v1/health/live` | `200` — `{"data":{"status":"ok"},"meta":{},"error":null}` |
| `GET /v1/health/ready` | `503` saat Postgres+Redis mati, dengan detail per dependency |
| `GET /v1/tidak-ada` | `404` — envelope dengan `code: NOT_FOUND` |
| Security header | CSP, HSTS, X-Content-Type-Options, X-Frame-Options aktif |

### Versi ter-pin (catalog `pnpm-workspace.yaml`)

Next 16.3.0 · React 19.2.8 · NestJS 11.1.29 · Prisma 7.9.1 · Tailwind 4.3.3 ·
TypeScript 5.9.3 · Zod 4.4.3 · pnpm 10.30.0 · Node 20.20.0.

Semua sesuai stack LOCKED di `CLAUDE.md`. Tidak ada `"latest"` di mana pun —
dijaga guard CI, bukan cuma niat baik.

### Aturan non-negotiable yang sudah punya penegakan

| # | Aturan | Penegakan |
|---|---|---|
| 3 | Push & Sentry tanpa isi curhat | `NOTIFICATION_TEMPLATES` = set tertutup; `NotificationPayload` sengaja **tidak punya** field `body`. Exception filter hanya mencatat method+path. |
| 4 | API publik tanpa PII | Env server vs client dipisah skema; ESLint memblokir import env server dari bundle Next; test memastikan kedua skema tidak punya key beririsan |
| 5 | Semua halaman curhat noindex | `X-Robots-Tag: noindex, nofollow` di seluruh route web & admin + metadata `robots` |
| 6 | Dilarang `"latest"` | Catalog terpusat + guard CI yang gagal kalau ada versi mengambang |

Empat sisanya (#1 safety fallback, #2 L3 no auto-punish, #7 migration review,
#8 tone Indonesia) ditegakkan di E07, E17, dan E15.

### Keputusan yang diambil saat implementasi

1. **Shared package di-build ke CJS `dist/`.** NestJS (CJS) tidak bisa
   me-resolve `exports` yang menunjuk ke `.ts`. Alternatifnya `paths` mapping,
   tapi itu cuma menipu type checker — runtime tetap gagal. `apps/api` pakai
   `moduleResolution: Node16` agar `exports` terbaca.
2. **Global `ValidationPipe` NestJS dibuang.** `CLAUDE.md` menetapkan Zod di
   boundary; memasang dua stack validasi berarti dua sumber kebenaran yang bisa
   berbeda pendapat soal request yang sama. Yang dipakai `ZodValidationPipe`.
3. **`consistent-type-imports` dimatikan khusus `apps/api`.** NestJS resolve DI
   dari metadata `design:paramtypes`, yang cuma ada untuk *value* import.
   Mengubah class ter-inject jadi `import type` menghapus metadata itu dan
   provider gagal resolve **saat runtime** — kegagalan yang tidak terlihat oleh
   type checker. Ini jebakan halus; makanya rule-nya dimatikan dengan alasan
   tertulis, bukan di-`--fix` diam-diam.
4. **Kontras warna diuji di CI, bukan dilihat mata.** Aksen hangat di atas dasar
   gelap gampang gagal AA. `apps/web/lib/contrast.test.ts` menghitung rasio
   untuk 3 tema × 5 pasangan; build gagal kalau ada token melenceng.
5. **`.env` dicari ke atas dari cwd.** API biasanya dijalankan dari `apps/api`
   sementara `.env` ada di root monorepo.

### Catatan & keterbatasan

- **Docker tidak terpasang di mesin ini.** `docker-compose.dev.yml` sudah ditulis
  dan tervalidasi secara struktur, tapi **belum pernah dijalankan**. Perlu
  `docker compose up -d` di mesin yang punya Docker sebelum E02 (Prisma butuh
  Postgres hidup). Ini satu-satunya kriteria E01 yang belum diverifikasi
  langsung.
- `.env` lokal berisi nilai dev dummy — **bukan** kredensial asli, dan tidak
  ter-track git.
- Halaman `/` di web sekarang halaman token sementara; diganti landing page
  asli di E15-T05.

---

## Blocker rilis (di luar coding)

Tiga hal ini menahan go-live dan tidak bisa diselesaikan dengan menulis kode:

1. **Daftar hotline Indonesia terverifikasi** (E17-T12, PRD §15.2) — tanpa ini
   layar krisis L3 kosong. Nomor yang salah lebih berbahaya daripada tidak
   menampilkan apa pun.
2. **Pendaftaran PSE** (E17-T11, PRD §25.1) — prosedur wajib diverifikasi ke
   sumber resmi terkini; nama kementerian sudah berubah.
3. **Rotasi moderator malam** (PRD §15.3) — SLA Critical 30 menit di jam
   21.00–04.00 hanya bisa ditepati kalau ada orangnya.

Plus: naskah Privacy Policy / ToS / Community Guidelines (butuh review hukum),
dan sign-off 13 nilai usulan di PRD §25.7.

---

## Langkah Berikutnya

**E02 — Database & Prisma** (9 task). Prasyarat: Docker jalan supaya Postgres
16 hidup untuk `prisma migrate dev`.

Urutan setelahnya mengikuti jalur kritis:
`E02 → E03 → E05 → E07 → E10 → E11`.

Catatan urutan: **E07 (Safety) wajib selesai sebelum E09 (DONG AI) dirilis** —
AI yang jalan tanpa safety engine melanggar aturan non-negotiable #1.
