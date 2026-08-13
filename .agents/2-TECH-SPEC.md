# CURHAT DONG — Tech Spec v1.2

> **Status:** Revised / Ready for Task Generator  
> **Sumber utama:** `.agents/1-PRD.md` (Master PRD v1.1) + Tech Spec v1.1  
> **v1.2 (12 Agustus 2026):** menurunkan gap PRD v1.1 ke keputusan teknis — BAGIAN 18 (Compliance & Crisis Protocol) dan BAGIAN 19 (Moderation Appeal), plus perluasan §2.2, §4.3, §4.7. Keputusan stack v1.1 **tidak diubah** dan tetap LOCKED.  
> **Scope:** MVP Phase 1 — Web + Android APK/AAB + Admin + API  
> **Hosting:** Vultr VPS + Docker Compose  
> **Domain:** `curhatdong.com` / `api.curhatdong.com` / `admin.curhatdong.com`  
> **Tanggal revisi:** 12 Agustus 2026

---

# 1. Tujuan Revisi v1.1

Tech Spec v1.1 mempertahankan arsitektur utama v1.0, tetapi memperbarui dependency dan beberapa keputusan implementasi agar lebih aman untuk project greenfield dan lebih siap production.

Perubahan utama:

1. Next.js `15.x` → **Next.js 16.3.x**
2. Expo SDK `53+` → **Expo SDK 57**
3. Prisma `6.x` → **Prisma ORM 7.x**
4. Web/Admin menggunakan **Tailwind CSS 4.x**
5. Mobile tetap menggunakan **NativeWind 4.x + Tailwind CSS 3.4.x**
6. Push Android menggunakan **Expo Push Service sebagai default MVP**, dengan jalur migrasi ke direct FCM.
7. Tambah **Transactional Email Provider** untuk Email OTP.
8. Tambah **Cloudflare Turnstile** untuk bot/CAPTCHA protection.
9. Safety fallback diubah:
   - normal/low-risk → boleh fail-open ke L1 ketika AI timeout;
   - indikasi high-risk dari local rule engine → **fail-safe / HOLD** sampai re-analysis atau moderation.
10. Push token database dibuat provider-agnostic.
11. Dependency version harus dipin melalui lockfile (`pnpm-lock.yaml`), bukan memakai `latest` di production.

---

# BAGIAN 1 — Tech Stack & Arsitektur

## 1.1 Tech Stack Final MVP

| Layer | Technology | Version / Policy |
|---|---|---|
| Runtime | Node.js | LTS, pin di Docker image |
| Language | TypeScript | 5.x |
| Package manager | pnpm | pinned via `packageManager` |
| Monorepo | Turborepo + pnpm workspace | current stable, lockfile pinned |
| Web | Next.js App Router + React | **Next.js 16.3.x / React 19.x** |
| Admin | Next.js App Router + React | **Next.js 16.3.x / React 19.x** |
| Styling Web/Admin | Tailwind CSS + shadcn/ui | **Tailwind 4.x** |
| Android | React Native + Expo Dev Build/EAS | **Expo SDK 57** |
| Mobile navigation | Expo Router | version compatible dengan SDK 57 |
| Styling Mobile | NativeWind | **4.x** |
| Tailwind Mobile | Tailwind CSS | **3.4.x khusus `apps/mobile`** |
| Mobile runtime | Hermes | Expo default |
| Client state | Zustand | current stable major, lockfile pinned |
| Server state | TanStack Query | v5 |
| API Backend | NestJS modular monolith | 11.x |
| Validation | Zod + NestJS DTO boundary | current stable |
| Database | PostgreSQL | **16** |
| ORM | Prisma ORM | **7.x** |
| Cache | Redis | 7 |
| Queue | BullMQ | current stable |
| Realtime | Socket.IO + NestJS Gateway | 4.x |
| AI Streaming | SSE | HTTP |
| Auth | Email OTP + Google OAuth + JWT | access 15m + rotating refresh |
| Transactional Email | Resend adapter | provider-agnostic |
| Bot protection | Cloudflare Turnstile | server-side verification |
| Android Push | `expo-notifications` + Expo Push Service → FCM | default MVP |
| Web Push | Web Push / service worker | Phase 1 |
| Object Storage | Vultr Object Storage | S3-compatible |
| AI | Internal AI Gateway | Anthropic/OpenAI/local-compatible adapters |
| Reverse Proxy | Caddy | 2.x |
| Hosting | Vultr VPS | Docker Compose |
| Container Registry | GitHub Container Registry | GHCR |
| CI/CD | GitHub Actions | build/test/deploy |
| Error Monitoring | Sentry | web/api/mobile |
| Uptime | Uptime Kuma | health monitoring |
| Container Logs | Dozzle | MVP |
| Advanced Logs | Loki/Grafana | scale-up path |
| Backup | pg_dump → Vultr Object Storage | daily |
| Feature flags | DB-backed `feature_flags` | no redeploy required |

> **Dependency policy:** jangan menggunakan `"latest"` di `package.json` production. Gunakan major/minor yang disetujui dan commit `pnpm-lock.yaml`.

---

## 1.2 Penting: Tailwind Web dan Mobile Dipisah

Karena NativeWind v4 menggunakan Tailwind CSS 3.4.x, dependency Tailwind tidak boleh dipaksa satu versi untuk seluruh workspace.

```text
apps/web
├── Next.js 16.3.x
├── React 19.x
├── Tailwind CSS 4.x
└── shadcn/ui

apps/admin
├── Next.js 16.3.x
├── React 19.x
├── Tailwind CSS 4.x
└── shadcn/ui

apps/mobile
├── Expo SDK 57
├── Expo Router
├── NativeWind 4.x
└── Tailwind CSS 3.4.x
```

**Rule:** `apps/mobile` mempunyai dev dependency Tailwind sendiri.

---

## 1.3 Arsitektur Sistem

```text
                    INTERNET
                       │
                       ▼
                 ┌───────────┐
                 │   Caddy   │
                 │ TLS / HSTS│
                 └─────┬─────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
┌────────────┐   ┌────────────┐   ┌────────────┐
│ Next Web   │   │ Next Admin │   │ NestJS API │
│ 16.3.x     │   │ 16.3.x     │   │ 11.x       │
└────────────┘   └────────────┘   └─────┬──────┘
                                        │
                        ┌───────────────┼───────────────┐
                        │               │               │
                        ▼               ▼               ▼
                  PostgreSQL 16      Redis 7     Object Storage
                        │               │
                        │               ├── cache
                        │               ├── rate limit
                        │               ├── BullMQ
                        │               └── listener availability
                        │
                        ▼
                 ┌──────────────┐
                 │ BullMQ Worker│
                 └──────┬───────┘
                        │
          ┌─────────────┼──────────────────┐
          │             │                  │
          ▼             ▼                  ▼
     AI Gateway    Notification        Email Adapter
          │          Service              │
   ┌──────┼──────┐      │               Resend
   │      │      │      │
   ▼      ▼      ▼      ├── Expo Push → FCM
OpenAI Anthropic Local  └── Web Push
```

Android:

```text
Expo Android App
      │
      ├── REST/HTTPS ───────────────► NestJS API
      ├── Socket.IO `/rt` ──────────► NestJS Gateway
      ├── SSE DONG AI ──────────────► NestJS API
      └── expo-notifications
                │
                ▼
         Expo Push Service
                │
                ▼
               FCM
                │
                ▼
             Android
```

---

## 1.4 Architectural Style

### Modular Monolith

Satu backend NestJS, tetapi domain dipisahkan sebagai module.

```text
auth
users
profiles
posts
feed
comments
reactions
felt-heard
ai
listener
chat
safety
moderation
notifications
search
admin
analytics
feature-flags
```

**Keuntungan:**

- development cepat untuk solo/small team;
- transaksi database sederhana;
- debugging lebih mudah;
- tidak membutuhkan service mesh/Kubernetes;
- masih mempunyai jalur scale ke service terpisah.

### Worker Terpisah

Worker berada pada container terpisah walaupun menggunakan codebase yang sama.

Job utama:

```text
analyze-post
analyze-message
recompute-trust-score
listener-match
push-notification
email-delivery
notification-fanout
daily-analytics
cleanup-expired-session
cleanup-expired-otp
```

---

## 1.5 Struktur Folder Monorepo

```text
curhat-dong/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   │
│   ├── admin/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   │
│   ├── mobile/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── global.css
│   │   ├── tailwind.config.js
│   │   └── app.config.ts
│   │
│   └── api/
│       └── src/
│           ├── modules/
│           │   ├── auth/
│           │   ├── users/
│           │   ├── profiles/
│           │   ├── posts/
│           │   ├── feed/
│           │   ├── comments/
│           │   ├── reactions/
│           │   ├── felt-heard/
│           │   ├── ai/
│           │   ├── listener/
│           │   ├── chat/
│           │   ├── safety/
│           │   ├── moderation/
│           │   ├── notifications/
│           │   ├── search/
│           │   ├── admin/
│           │   ├── analytics/
│           │   └── feature-flags/
│           ├── common/
│           ├── config/
│           └── main.ts
│
├── packages/
│   ├── database/
│   │   ├── prisma/
│   │   └── src/
│   ├── types/
│   ├── ai/
│   │   ├── providers/
│   │   ├── prompts/
│   │   ├── routing/
│   │   └── safety/
│   ├── auth/
│   ├── notifications/
│   ├── config/
│   └── ui/
│
├── infrastructure/
│   ├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── Caddyfile
│   ├── scripts/
│   └── github-actions/
│
├── .agents/
│   ├── 1-PRD.md
│   ├── 2-TECH-SPEC.md
│   └── tasks/
│
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 1.6 Justifikasi Teknologi

### Next.js 16.3

Digunakan untuk Web dan Admin karena:

- App Router;
- React Server Components;
- mature ecosystem;
- cocok dengan TypeScript/Tailwind;
- reusable components melalui `packages/ui`;
- deployment tetap dapat dilakukan sebagai Node container di Vultr.

### Expo SDK 57

Digunakan untuk Android karena:

- React Native tetap satu ekosistem TypeScript;
- dev build lebih sesuai daripada mengandalkan Expo Go untuk production development;
- EAS menghasilkan APK dan AAB;
- mendukung OTA JS update melalui `expo-updates`;
- jalur iOS tetap terbuka di phase berikutnya.

### NestJS

Cocok untuk domain CURHAT DONG yang mulai kompleks:

- auth;
- social feed;
- moderation;
- realtime;
- listener matching;
- AI orchestration;
- admin RBAC.

Tetap gunakan **modular monolith**, bukan microservices pada MVP.

### PostgreSQL 16

Dipertahankan karena data CURHAT DONG sangat relational dan PostgreSQL 16 masih cocok untuk production.

### Prisma ORM 7

Dipakai sebagai ORM utama.

Rule:

- gunakan Prisma 7 conventions;
- generated client tidak dicampur dengan source domain;
- migration harus committed;
- production hanya menjalankan `prisma migrate deploy`;
- jangan menjalankan destructive migration otomatis tanpa review.

### Redis + BullMQ

Redis digunakan untuk:

- cache;
- distributed rate limit;
- listener availability;
- Socket.IO Redis adapter ketika multi-node;
- queue BullMQ;
- short-lived coordination locks.

Redis **bukan source of truth** untuk data user atau chat history.

---

# BAGIAN 2 — Database Design

## 2.1 Ringkasan

| Item | Detail |
|---|---|
| Database | PostgreSQL 16 |
| ORM | Prisma ORM 7.x |
| Migration | Prisma Migrate |
| Pendekatan | Relational |
| ID | UUID/CUID2 sesuai convention project |
| Time | UTC di database |
| Soft delete | hanya entity yang membutuhkan audit/recovery |
| Privacy principle | identity dipisahkan dari public content |

Prinsip utama:

> Email, provider ID, device token, dan data auth tidak pernah menjadi public identifier.

Public API hanya menggunakan internal/public-safe identifier.

---

## 2.2 Entity Overview MVP

| Entity | Key Fields | Relasi / Catatan |
|---|---|---|
| users | id, status, trust_score_internal, created_at | root identity |
| auth_accounts | id, user_id, provider, provider_id, email_hash, email_encrypted | private |
| otp_challenges | id, email_hash, code_hash, purpose, expires_at, attempts, consumed_at | short-lived |
| user_profiles | user_id, alias, avatar, bio, is_listener, joined_at | public-safe profile |
| anonymous_identities | id, user_id, post_id, display_code | per-post anonymous identity |
| user_devices | id, user_id, platform, push_provider, push_token_encrypted, last_seen | Expo/FCM/Web Push |
| user_sessions | id, user_id, refresh_token_hash, family_id, expires_at, revoked_at | rotating refresh |
| post_categories | id, slug, name, icon, display_order, is_active | categories |
| curhat_posts | id, author_id, category_id, title?, body, mood, intent, anonymity_mode, allow_comments, safety_level, status, response_count, noindex | core post |
| comments | id, post_id, author_id, parent_id?, body, is_marked_helpful, status | replies |
| reactions | id, target_type, target_id, user_id, type | emotional reactions |
| felt_heard_feedback | id, post_id?, session_id?, user_id, answer | North Star input |
| mood_entries | id, user_id, mood, source, created_at | minimal MVP data |
| listener_profiles | user_id, topics[], languages[], max_concurrent, session_count, helpful_score, felt_heard_score, safety_status | listener |
| listener_availability | user_id, is_available, updated_at | mirrored to Redis |
| listener_requests | id, requester_id, topic, emotion, post_id?, status | matching request |
| listener_matches | id, request_id, requester_id, listener_id, status, expires_at | offer lifecycle |
| listener_sessions | id, room_id, requester_id, listener_id, started_at, ended_at, end_reason | completed sessions |
| chat_rooms | id, type, status, created_at | room |
| room_members | room_id, user_id, role, joined_at, left_at | room membership |
| messages | id, room_id, sender_id, body, created_at, safety_level | realtime persisted |
| ai_conversations | id, user_id, personality_mode, created_at | DONG AI |
| ai_messages | id, conversation_id, role, body, tokens_in, tokens_out, model, provider | usage |
| ai_classifications | id, target_type, target_id, emotion, topic, intent, urgency, risk_scores, safety_level, provider, model, prompt_version | moderation |
| ai_usage_events | id, user_id?, operation, provider, model, tokens_in, tokens_out, cost_estimate, latency_ms | cost observability |
| safety_events | id, user_id?, target_type, target_id, level, action_taken, resource_shown | audit |
| reports | id, reporter_id, target_type, target_id, category, note, priority, status | user report |
| moderation_cases | id, source, queue, status, assigned_to, created_at | moderation |
| moderation_actions | id, case_id, moderator_id, action, reason, created_at | audit |
| blocked_users | blocker_id, blocked_id, created_at | composite unique |
| trust_scores | user_id, score, factors, computed_at | internal |
| notifications | id, user_id, type, payload, read_at | payload tanpa isi curhat |
| notification_settings | user_id, per_type_toggles | user preferences |
| feature_flags | key, value, updated_by, updated_at | runtime flags |
| app_configs | key, value, updated_by, updated_at | config |
| audit_logs | id, actor_id, action, target_type, target_id, diff, ip_hash, created_at | admin/security |

### Entity tambahan v1.2 (turunan PRD v1.1)

| Entity | Key Fields | Relasi / Catatan |
|---|---|---|
| consent_records | id, user_id, consent_type, document_version, granted, granted_at, revoked_at, method | PRD §25.3 — satu baris per jenis consent per versi; **jangan** dipadatkan jadi satu boolean |
| moderation_appeals | id, action_id, user_id, reason, status, reviewer_id, decided_at, decision_note | PRD §15.4 — `reviewer_id` wajib ≠ moderator pemutus |
| support_resources | id, region, name, channel, value, hours, language, is_active, verified_at, source_url | PRD §15.2 — realisasi teknis dari "hotline di konfigurasi": tabel tersendiri karena butuh query per region + filter `verified_at`, bukan blob di `app_configs` |
| felt_heard_prompts | id, user_id, target_type, target_id, shown_at, answered_at, answer?, dismissed | PRD §9 anti-fatigue — sumber penegakan frekuensi **dan** penyebut Felt Heard Rate |
| listener_session_counters | user_id, date, completed_count, last_session_ended_at | PRD §11.2 — cap harian & cooldown; mirror panas di Redis, Postgres tetap source of truth |
| data_export_requests | id, user_id, status, requested_at, completed_at, file_key, expires_at | PRD §25.2 hak portabilitas |
| retention_runs | id, job_name, entity, deleted_count, started_at, finished_at, status | PRD §25.4 — bukti kepatuhan bahwa retensi benar-benar berjalan |

Perubahan field pada entity yang sudah ada:

| Entity | Perubahan |
|---|---|
| users | `+ age_declared_at`, `+ deleted_at`, `+ deletion_mode` (`purge` \| `anonymize`) |
| user_devices | `+ quiet_hours_start`, `+ quiet_hours_end`, `+ timezone` (PRD §14) |
| listener_profiles | `+ guidelines_version_accepted`, `+ guidelines_accepted_at` (PRD §11.1) |
| moderation_actions | `+ is_appealable`, `+ appealed` |
| messages | `+ safety_level` sudah ada — tambah `+ needs_reanalysis` agar sejalan dengan fallback §4.2 |

---

## 2.3 Post Status

```text
draft
pending_analysis
published
held
removed
deleted
```

Safety level:

```text
L0 = normal
L1 = sensitive
L2 = potential harm
L3 = immediate/high risk
```

---

## 2.4 Index Strategy

Minimum indexes:

```text
curhat_posts(status, created_at DESC)
curhat_posts(category_id, created_at DESC)
curhat_posts(response_count, created_at DESC)

comments(post_id, created_at)
messages(room_id, created_at)

listener_availability(is_available)
listener_matches(request_id, status)
listener_matches(listener_id, status)

moderation_cases(queue, status, created_at)
ai_classifications(target_type, target_id)

notifications(user_id, read_at, created_at DESC)
user_sessions(user_id, revoked_at)
```

Partial index:

```sql
WHERE status = 'published'
```

untuk feed utama.

Search MVP:

```text
PostgreSQL full-text search
tsvector + GIN index
```

Tidak perlu Elasticsearch/OpenSearch pada Phase 1.

---

# BAGIAN 3 — Interface Design

Base API:

```text
https://api.curhatdong.com/v1
```

Standard response:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

Error mempunyai stable `code`, bukan hanya message.

---

## 3.1 Auth & Account

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/otp/request` | Request OTP via email | No |
| POST | `/auth/otp/verify` | Verify OTP → token pair | No |
| POST | `/auth/google` | Login/registration Google | No |
| POST | `/auth/refresh` | Rotate refresh token | Refresh |
| POST | `/auth/logout` | Revoke current session | Yes |
| POST | `/auth/logout-all` | Revoke all sessions | Yes |
| POST | `/onboarding` | alasan, topik, alias, age gate 18+ | Yes |
| GET/PATCH | `/me` | profile sendiri | Yes |
| DELETE | `/me` | delete/anonymize account flow | Yes |
| GET/PATCH | `/me/notification-settings` | notification preference | Yes |
| POST/DELETE | `/users/:id/block` | block/unblock | Yes |
| GET | `/users/:alias` | public-safe profile | Yes |

OTP rules:

```text
TTL OTP        : 10 menit
Max request    : 5 / jam / email hash
Max verify     : configurable
Store OTP      : hash only
Enumeration    : response generik
Turnstile      : required when risk/anomaly threshold triggered
```

---

## 3.2 Posts / Feed / Interaction

| Method | Path | Description |
|---|---|---|
| GET | `/feed?tab=untuk-kamu&cursor=` | For You |
| GET | `/feed?tab=terbaru&cursor=` | Latest |
| GET | `/feed?tab=butuh-didengar&cursor=` | low-response feed |
| GET | `/categories` | categories |
| POST | `/posts` | create curhat |
| GET | `/posts/:id` | detail |
| DELETE | `/posts/:id` | delete own post |
| PUT/DELETE | `/posts/:id/reactions` | reaction |
| GET/POST | `/posts/:id/comments` | comments |
| POST | `/comments/:id/helpful` | mark helpful |
| PUT/DELETE | `/comments/:id/reactions` | comment reactions |
| POST | `/posts/:id/felt-heard` | Felt Heard feedback |
| POST | `/reports` | report target |
| GET | `/search` | internal FTS |

---

## 3.3 DONG AI

| Method | Path | Description |
|---|---|---|
| GET | `/ai/conversations` | list conversation |
| POST | `/ai/conversations` | create conversation |
| GET | `/ai/conversations/:id/messages` | history |
| POST | `/ai/conversations/:id/messages` | SSE streamed response |

SSE events:

```text
message.start
message.delta
message.complete
safety.intervention
error
```

---

## 3.4 Listener & Private Chat

| Method | Path | Description |
|---|---|---|
| GET/PUT | `/listener/profile` | listener configuration |
| PUT | `/listener/availability` | available/unavailable |
| POST | `/listener/requests` | request listener |
| POST | `/listener/matches/:id/accept` | accept |
| POST | `/listener/matches/:id/decline` | decline |
| GET | `/rooms` | room list |
| GET | `/rooms/:id/messages?cursor=` | history |
| POST | `/rooms/:id/close` | close |
| POST | `/rooms/:id/feedback` | feedback |
| POST | `/devices` | register/update push token |
| DELETE | `/devices/:id` | unregister device |
| GET | `/notifications?cursor=` | in-app notification |

---

## 3.5 WebSocket `/rt`

Authentication:

```text
JWT access token saat connection handshake
```

Client → Server:

```text
room:join
room:message
room:typing
room:leave
```

Server → Client:

```text
room:message
room:typing
room:presence
room:closed
match:offer
match:accepted
notification:new
```

Server wajib mengecek membership setiap event sensitif.

---

## 3.6 Admin API

Admin domain:

```text
admin.curhatdong.com
```

API namespace:

```text
/admin/*
```

Minimum:

| Method | Path | Role |
|---|---|---|
| POST | `/admin/auth/login` | Admin |
| POST | `/admin/auth/mfa/verify` | Admin |
| GET | `/admin/dashboard` | Admin |
| GET/PATCH | `/admin/users` | Moderator+ |
| GET | `/admin/moderation/queue` | Moderator+ |
| POST | `/admin/moderation/cases/:id/action` | Moderator+ |
| GET/PATCH | `/admin/posts/:id` | Moderator+ |
| CRUD | `/admin/categories` | Content Manager |
| GET/PATCH | `/admin/ai/config` | Super Admin |
| GET/PATCH | `/admin/listeners` | Moderator+ |
| POST | `/admin/notifications/broadcast` | Content Manager+ |
| GET | `/admin/analytics` | Admin |

Semua akses private content dari Admin harus mempunyai `audit_logs`.

---

# BAGIAN 4 — Business Logic

## 4.1 Create Curhat + Safety v1.1

Flow:

```text
User submit
    │
    ▼
API validation
    │
    ├── schema validation
    ├── rate limit
    ├── basic spam rule
    ├── doxxing/personal-data pattern
    └── local high-risk rule engine
    │
    ▼
Save: pending_analysis
    │
    ▼
BullMQ analyze-post
    │
    ▼
AI Gateway
    │
    ├── emotion
    ├── topic
    ├── intent
    ├── urgency
    └── risk scores
    │
    ▼
Safety mapping
```

Decision:

```text
L0
└── publish

L1
├── publish
└── monitoring flag

L2
├── HOLD
├── moderation case High/Medium
└── user informed content sedang ditinjau

L3
├── DO NOT publish to feed
├── supportive intervention
├── show appropriate configured support resources
├── moderation case Critical
└── create safety_event
```

---

## 4.2 AI Timeout Fallback — Revised

**Tidak menggunakan satu global fail-open rule.**

```text
                    AI TIMEOUT
                        │
             ┌──────────┴──────────┐
             │                     │
   local rules normal/low     local high-risk flag
             │                     │
             ▼                     ▼
     Publish sebagai L1            HOLD
             │                     │
      queue re-analysis      Critical/High review
```

Rules:

### Normal / Low Risk

Jika AI timeout dan local safety rule tidak menemukan high-risk signal:

```text
status       = published
safety_level = L1
needs_reanalysis = true
```

### High Risk

Jika local rule menemukan strong high-risk signal dan AI timeout:

```text
status       = held
safety_level = pending
priority     = high/critical
```

Kemudian:

```text
retry AI with exponential backoff
+
create moderation case
```

Tujuannya:

> outage AI provider tidak boleh menjadi jalur bypass safety.

---

## 4.3 DONG AI Safety

Setiap pesan:

```text
User message
   │
   ├── input moderation
   ├── risk classification async/parallel
   └── context builder
          │
          ▼
       AI Gateway
          │
          ▼
        SSE stream
```

AI system rules:

- bukan dokter/psikolog;
- tidak melakukan diagnosis;
- tidak memberikan resep obat;
- tidak mendorong dependensi emosional;
- tidak mendorong isolasi dari manusia;
- high-risk → supportive intervention;
- high-risk → human/professional support bridge ketika relevan;
- safety classifier tidak hanya bergantung pada conversation model.

### 4.3.1 Safety Level pada Pesan (v1.2 — PRD §15.5)

Berlaku untuk `ai_messages` **dan** `messages` (private room):

| Level | `messages` (room) | `ai_messages` (DONG AI) |
|---|---|---|
| L0 | deliver | reply normal |
| L1 | deliver + `needs_monitoring` | reply + flag |
| L2 | deliver + moderation case Medium/High; jika target-directed (harassment/threat/doxxing) → warning ke pengirim + surface report/block ke penerima | AI redirect + resources; buat case |
| L3 | **deliver**, jalankan SOP crisis, resources ke kedua pihak, aktifkan escalate | AI respons suportif, resources, jalankan SOP crisis |

Aturan implementasi:

```text
JANGAN auto-close room pada L3
JANGAN blokir pengiriman pesan pada L3
JANGAN membuat AI menolak bicara ("saya tidak bisa membahas ini") pada L3
```

Alasannya sama dengan PRD §15.5: memutus percakapan seseorang yang sedang dalam
krisis adalah kegagalan produk, bukan mitigasi. Yang boleh diputus otomatis hanya
perilaku yang menyerang orang lain, bukan penderitaan diri sendiri.

Klasifikasi pesan berjalan **asynchronous** agar tidak menambah latency delivery
(<2s target §8.3). Konsekuensinya pesan bisa terkirim sebelum klasifikasi selesai
— itu diterima, karena aksi pada semua level di atas bersifat *additive*
(menambahkan resources/case), bukan menahan pesan.

---

## 4.4 AI Gateway

Interface konseptual:

```ts
interface AIProvider {
  moderate(input: string): Promise<ModerationResult>;
  classifyEmotion(input: string): Promise<EmotionResult>;
  detectIntent(input: string): Promise<IntentResult>;
  assessRisk(input: string): Promise<RiskResult>;
  chat(input: ChatInput): AsyncIterable<ChatChunk>;
}
```

Routing:

```text
Cheap / fast model
├── tagging
├── emotion
├── intent
├── spam
└── basic classification

Advanced model
├── ambiguous safety
├── difficult context
└── complex DONG AI conversation
```

AI config disimpan di admin/config dan mempunyai audit trail.

Provider API key tidak pernah dikirim ke client.

---

## 4.5 Listener Matching

```text
Request
   │
   ▼
Redis available listener set
   │
   ▼
Filter:
├── topic overlap
├── language
├── not blocked two-way
├── safety status OK
├── concurrency capacity
└── listener enabled
   │
   ▼
Rank:
├── helpful score
├── felt heard score
├── topic experience
└── previous positive interaction
   │
   ▼
Offer candidate #1
   │
   ├── accepted → create room/session
   └── declined/60s timeout
          │
          ▼
       next candidate
```

Maksimum default candidate attempt:

```text
5
```

Jika gagal:

- tawarkan DONG AI;
- tawarkan post ke Butuh Didengar;
- jangan menjanjikan listener tersedia.

---

## 4.6 Felt Heard

Trigger:

```text
post mendapat >= 1 human response
OR
listener session selesai
```

Prompt tidak perlu langsung; dapat diberi delay configurable.

Answer:

```text
yes
somewhat
no
```

North Star:

```text
Felt Heard Rate
```

---

## 4.7 Business Rules Kunci

- MVP hanya untuk user **18+**.
- Anonymous identity tidak menghilangkan internal moderation linkage.
- Public API tidak mengekspos email/provider identity.
- Block berlaku dua arah pada:
  - feed;
  - comment visibility;
  - listener matching;
  - private interaction.
- Default rate limit:
  - post: `10/day`;
  - comment: `60/hour`;
  - report: `20/day`;
  - AI: `50 messages/day`;
  - OTP request: `5/hour/email`.
- Push notification **tidak pernah memuat isi curhat atau isi private chat**.
- Butuh Didengar:
  - `response_count < 2`;
  - umur `< 48 jam`;
  - latest-first dengan future ranking hook.
- Post L1+ tidak diberi engagement virality boosting.
- Semua halaman curhat private/public-feed detail yang sensitif harus `noindex`.
- Journal lengkap / mood history adalah Phase 2.
- Admin private content access hanya melalui authorized workflow + audit.
- Deleting account mengikuti configured delete/anonymization policy.

### Tambahan v1.2 (PRD v1.1)

- **Listener capacity** (PRD §11.2):
  - `max_concurrent` default `3`, user boleh menurunkan, tidak boleh menaikkan;
  - `8` sesi selesai/hari → availability auto-off;
  - cooldown `10 menit` antar sesi — listener dikeluarkan dari candidate set selama cooldown;
  - decline/timeout offer **tidak** menurunkan skor ranking (§4.5).
- **Felt Heard anti-fatigue** (PRD §9): max `1×` per post & per sesi, `3×`/hari/user, delay `30 menit` setelah respons pertama, dismissable permanen. `dismissed` **tidak** masuk penyebut Felt Heard Rate.
- **AI cost guard** (PRD §10): alert `70%`/`90%` `AI_DAILY_BUDGET`; pada `≥90%` seluruh routing **non-safety** turun ke cheap model dan kuota user harian jadi `25`.
  - **Klasifikasi safety tidak pernah didegradasi atau di-skip karena budget.** Bila budget habis, yang berhenti adalah endpoint percakapan DONG AI (`503` + copy hangat), bukan `analyze-post` / `analyze-message`.
- **Quiet hours push** (PRD §14): default `22:00–07:00` waktu lokal device; notifikasi non-safety ditahan/di-drop, notifikasi safety & akun tetap dikirim.
- **Age gate** (PRD §25.5): self-declaration + `age_declared_at`; penolakan memicu cooldown pada device/browser.
- **Consent** (PRD §25.3): 3 jenis consent tercatat terpisah di `consent_records`; consent analitik opsional dan **tidak boleh** menjadi syarat akses fitur inti.
- **Appeal** (PRD §15.4): aksi `remove/warn/mute/suspend/ban` bersifat appealable; window `14 hari`; `1` banding per aksi; SLA respons `7 hari`.
- **Aksesibilitas** (PRD §23.1): kontras AA, font scaling s/d 200%, label screen reader untuk 11 mood + 6 reaction + 4 intent, touch target ≥44px, hormati `prefers-reduced-motion`. Diperlakukan sebagai acceptance criteria UI, bukan polish opsional.

---

# BAGIAN 5 — Authentication

## 5.1 JWT

```text
Access Token
TTL: 15 menit

Refresh Token
rotating
stored hashed
device/session scoped
```

Reuse detection:

```text
old refresh token dipakai lagi
        │
        ▼
revoke token family
        │
        ▼
require login again
```

Mobile token storage:

```text
Expo SecureStore
```

Web:

```text
secure HttpOnly cookie untuk refresh/session-sensitive token
```

Hindari menyimpan refresh token di `localStorage`.

---

## 5.2 Email OTP

Provider default:

```text
Resend
```

Tetapi backend menggunakan adapter:

```ts
interface EmailProvider {
  sendOtp(input: SendOtpInput): Promise<void>;
  sendTransactional(input: TransactionalEmailInput): Promise<void>;
}
```

Sehingga dapat dipindah ke:

```text
Postmark
Amazon SES
provider lain
```

tanpa mengubah auth domain.

---

## 5.3 Google Login

Mobile:

```text
Google OAuth / native-compatible Expo auth flow
        │
        ▼
Google ID token / auth code
        │
        ▼
NestJS backend verification
        │
        ▼
internal user/session
```

Client tidak menentukan sendiri status user.

---

## 5.4 Password (Revisi 1 — 13 Agustus 2026)

Deviasi sadar dari PRD §"passwordless auth aman", diputuskan product owner:
setiap login OTP mengirim satu email Resend, dan user yang login berkali-kali
sehari menghabiskan kuota untuk hal yang bukan pendaftaran.

```text
Registrasi:  email OTP  →  wajib buat password  →  age gate  →  onboarding
Login rutin: email + password  (nol email terkirim)
Recovery:    email OTP (jalur yang sama dengan registrasi)  →  set password baru
Google:      tidak berubah
Admin:       tetap OTP + TOTP MFA, tanpa password
```

Ketentuan:

- Hash: scrypt, format self-describing `scrypt-v1$N=...,r=...,p=...$salt$hash`
  (`packages/auth/src/password.ts`); parameter bisa dinaikkan tanpa migrasi,
  baris lama di-rehash saat login sukses berikutnya.
- Kolom `users.password_hash` nullable — akun lama dan akun Google-only sah
  tanpa password.
- Anti-enumeration: email tak dikenal, akun tanpa password, dan password salah
  semuanya `AUTH_CREDENTIALS_INVALID` dengan bentuk, status, dan biaya scrypt
  identik (dummy verification).
- Rate limit fail-closed per email-hash dan per IP
  (`rate_limit.password_attempts_per_hour`), Turnstile pada anomali.
- "Wajib saat daftar" ditegakkan klien, di-gate `hasPassword` pada respons
  login. Server tidak pernah memblokir user terautentikasi yang belum punya
  password — user yang hard-refresh di tengah langkah buat-password diminta
  lagi pada login OTP berikutnya.
- Ganti password: wajib `currentPassword` ATAU sesi berumur < 15 menit (jalur
  lupa-password); perubahan mencabut semua sesi lain.

---

# BAGIAN 6 — Push Notification

## 6.1 MVP Android

Default:

```text
Android App
    │
expo-notifications
    │
ExpoPushToken
    │
NestJS
    │
Expo Push Service
    │
FCM
    │
Android
```

Database tidak menggunakan field bernama `fcm_token` secara hardcoded.

Gunakan:

```text
push_provider
push_token_encrypted
platform
device_id
last_seen
```

Contoh provider:

```text
expo
fcm
webpush
```

Dengan ini direct FCM dapat ditambahkan tanpa migration besar.

---

## 6.2 Notification Privacy

Allowed:

```text
"Ada seseorang yang membalas curhatmu."
"Ada seseorang yang sedang butuh didengar."
"Listener tersedia untukmu."
```

Tidak allowed:

```text
"[isi curhat]"
"[isi chat]"
"[isi pesan AI sensitif]"
```

Lock-screen privacy dianggap default requirement.

---

# BAGIAN 7 — Security

## 7.1 Network

- Caddy automatic TLS;
- HSTS;
- security headers;
- HTTP → HTTPS redirect;
- internal Docker network untuk DB/Redis;
- PostgreSQL/Redis tidak diekspos ke public internet.

---

## 7.2 Secrets

Production secrets:

```text
.env production dengan permission ketat
atau Docker secrets
```

Never:

```text
commit .env
hardcode API keys
expose server secrets via NEXT_PUBLIC_*
embed server key di APK
```

---

## 7.3 Bot & Abuse Protection

Layer:

```text
IP/user/email rate limit
        +
Redis counters
        +
Cloudflare Turnstile ketika anomaly
        +
basic device risk signal
        +
account trust score
```

Turnstile diverifikasi di backend.

---

## 7.4 Admin

Admin wajib:

```text
MFA TOTP
RBAC
audit log
short session
re-auth untuk action sangat sensitif
```

Optional:

```text
IP allowlist
VPN-only admin route
```

jika operation membutuhkannya.

---

## 7.5 Data Protection

Sensitive identity data:

```text
email_encrypted
email_hash
refresh_token_hash
push_token_encrypted
```

Hash dipakai untuk lookup/dedup bila diperlukan.

Encryption key tidak disimpan di database.

---

## 7.6 Backup

```text
Daily pg_dump
      │
      ▼
encrypted/secured backup
      │
      ▼
Vultr Object Storage
```

Retention MVP:

```text
30 hari
```

Test restore:

```text
minimum monthly
```

Backup yang tidak pernah dites restore dianggap belum valid.

---

# BAGIAN 8 — Performance

## 8.1 Cache

Redis cache:

```text
categories
feed first page
listener availability
rate limit counters
short-lived matching state
```

Feed cache TTL:

```text
30–60 detik
```

Jangan cache personalized sensitive response secara global.

---

## 8.2 Pagination

Semua collection besar menggunakan cursor pagination:

```text
posts
comments
messages
notifications
admin moderation queue
```

Hindari offset pagination untuk dataset besar.

---

## 8.3 Target MVP

| Metric | Target |
|---|---|
| API p95 common endpoints | `< 500 ms` |
| Feed initial usable | `2–3 s` target |
| Realtime chat delivery | `< 2 s` target |
| AI first token | monitor separately |
| Availability | `99.5%+` |
| Error rate | monitored |
| AI cost/user | monitored |

---

# BAGIAN 9 — Deployment

## 9.1 MVP Infrastructure

```text
Vultr VPS
4 vCPU
8 GB RAM
```

Docker Compose:

```text
caddy
web
admin
api
worker
postgres
redis
uptime-kuma
dozzle
```

External:

```text
Vultr Object Storage
GitHub/GHCR
Sentry
Expo/EAS
Resend
AI Provider(s)
```

---

## 9.2 Production Docker Rules

- healthcheck setiap service utama;
- restart policy;
- resource limit bila diperlukan;
- PostgreSQL persistent volume;
- Redis persistent config sesuai queue requirement;
- container non-root bila image mendukung;
- image version/tag immutable untuk deploy;
- jangan deploy `latest` tag sebagai satu-satunya reference.

---

## 9.3 CI/CD

```text
GitHub push / merge main
       │
       ▼
Lint
       │
       ▼
Typecheck
       │
       ▼
Unit tests
       │
       ▼
Build Docker images
       │
       ▼
Push GHCR
       │
       ▼
SSH deploy
       │
       ├── pull image
       ├── prisma migrate deploy
       ├── docker compose up -d
       └── healthcheck gate
```

Migration failure:

```text
STOP deployment
```

Jangan menjalankan destructive schema changes otomatis tanpa migration strategy.

---

## 9.4 Android Build

Development:

```text
Expo Dev Build
```

Internal/testing:

```text
EAS Build → APK
```

Play Store:

```text
EAS Build → AAB
```

OTA:

```text
expo-updates / EAS Update
```

OTA hanya untuk perubahan yang kompatibel dengan `runtimeVersion`.

Perubahan native dependency membutuhkan build binary baru.

---

# BAGIAN 10 — Observability

## 10.1 Sentry

Aktif di:

```text
apps/web
apps/admin
apps/mobile
apps/api
worker
```

Jangan kirim content curhat mentah ke Sentry secara default.

Scrub:

```text
Authorization
Cookie
email
chat content
post body
AI conversation content
push token
```

---

## 10.2 Uptime

Endpoints:

```text
/health/live
/health/ready
```

`ready` memeriksa dependency minimum yang diperlukan untuk menerima traffic.

Uptime Kuma:

```text
API
Web
Admin
```

Alert:

```text
Telegram / configured ops channel
```

---

## 10.3 AI Observability

Log metadata:

```text
provider
model
operation
latency
tokens_in
tokens_out
cost_estimate
status
fallback_used
prompt_version
```

Jangan menjadikan raw private conversation sebagai generic analytics log.

---

# BAGIAN 11 — Development Setup

## 11.1 Prerequisites

```text
Node.js LTS
pnpm
Docker Desktop / Docker Engine
Git
Android Studio untuk emulator/local Android tools bila diperlukan
```

---

## 11.2 Install

```bash
pnpm install
```

Start infrastructure:

```bash
docker compose -f infrastructure/docker-compose.dev.yml up -d
```

Database:

```bash
pnpm --filter @curhat/database prisma generate
pnpm --filter @curhat/database prisma migrate dev
pnpm --filter @curhat/database seed
```

Web/Admin/API:

```bash
pnpm dev
```

Mobile:

```bash
cd apps/mobile
npx expo start --dev-client
```

Untuk membuat project SDK 57 dari nol:

```bash
npx create-expo-app@latest --template default@sdk-57
```

---

# BAGIAN 12 — Environment Variable Groups

Tidak menaruh nilai secret di dokumentasi.

```text
APP
NODE_ENV
APP_URL
API_URL
ADMIN_URL

DATABASE
DATABASE_URL

REDIS
REDIS_URL

AUTH
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
TOKEN_ENCRYPTION_KEY

GOOGLE
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

EMAIL
EMAIL_PROVIDER
RESEND_API_KEY
EMAIL_FROM

BOT PROTECTION
TURNSTILE_SECRET_KEY
TURNSTILE_SITE_KEY

OBJECT STORAGE
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY

AI
AI_DEFAULT_PROVIDER
OPENAI_API_KEY
ANTHROPIC_API_KEY
AI_DAILY_BUDGET

EXPO
EXPO_ACCESS_TOKEN
EXPO_PROJECT_ID

SENTRY
SENTRY_DSN

OPS
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Client-side variable harus dipisahkan jelas dari server secret.

---

# BAGIAN 13 — Scaling Path

## Stage A — MVP

```text
1 VPS
├── Caddy
├── Web
├── Admin
├── API
├── Worker
├── PostgreSQL
├── Redis
└── Monitoring
```

## Stage B — Growth

```text
App VPS
├── Caddy
├── Web/Admin
├── API
└── Worker

DB VPS / Managed PostgreSQL

Redis
Object Storage
```

## Stage C — High Traffic

```text
Load Balancer
     │
 ┌───┴────┐
API #1  API #2
  │       │
  └──Redis┘
      │
Worker pool
      │
PostgreSQL primary
      │
backup/read scaling as needed
```

Tidak perlu Kubernetes sebelum traffic/ops benar-benar membutuhkannya.

---

# BAGIAN 14 — Explicitly Out of Scope Phase 1

Tidak ditambahkan hanya karena tech stack mendukungnya:

- iOS App Store launch;
- Kubernetes;
- microservices;
- Kafka;
- Elasticsearch/OpenSearch;
- GraphQL;
- voice room;
- video call;
- professional marketplace;
- paid listener;
- virtual gift;
- marketplace;
- advanced communities;
- full journal;
- recommendation ML infrastructure kompleks.

MVP harus fokus pada core loop:

```text
Curhat
  ↓
Didengar
  ↓
Merasa Didengar
  ↓
Kembali
  ↓
Mendengarkan Orang Lain
```

---

# BAGIAN 15 — Final Architecture Decision

## LOCK untuk MVP Phase 1

```text
MONOREPO
pnpm + Turborepo

WEB
Next.js 16.3.x
React 19.x
Tailwind CSS 4.x
shadcn/ui

ADMIN
Next.js 16.3.x
React 19.x
Tailwind CSS 4.x
shadcn/ui

ANDROID
Expo SDK 57
Expo Router
NativeWind 4.x
Tailwind CSS 3.4.x
expo-notifications
expo-updates
EAS Build

BACKEND
NestJS 11.x
REST
SSE
Socket.IO

DATA
PostgreSQL 16
Prisma ORM 7.x
Redis 7
BullMQ

AUTH
Email OTP
Google OAuth
JWT access 15m
Rotating refresh token
Resend adapter
Cloudflare Turnstile

AI
Internal provider-agnostic AI Gateway
Cheap/advanced model routing
Independent safety classification
Cost logging
Fallback routing

PUSH
Expo Push Service → FCM
Web Push
Provider-agnostic device token schema

STORAGE
Vultr Object Storage

INFRA
Vultr VPS
Docker Compose
Caddy
GHCR
GitHub Actions

OBSERVABILITY
Sentry
Uptime Kuma
Dozzle
AI usage/cost monitoring
```

---

# BAGIAN 16 — Safety Architecture Decision

Final safety principle:

```text
NORMAL / LOW-RISK AI FAILURE
→ controlled fail-open to L1
→ publish + monitor + re-analysis

LOCAL HIGH-RISK SIGNAL + AI FAILURE
→ fail-safe
→ HOLD
→ retry AI
→ moderation escalation
```

**Safety provider outage tidak boleh menjadi safety bypass.**

---

# BAGIAN 17 — Definition of Ready for Task Generator

Tech Spec dianggap siap diturunkan menjadi development tasks ketika:

- [x] stack utama locked;
- [x] database approach locked;
- [x] REST/SSE/WebSocket boundary defined;
- [x] auth flow defined;
- [x] push architecture defined;
- [x] AI Gateway boundary defined;
- [x] safety fallback defined;
- [x] admin security defined;
- [x] deployment topology defined;
- [x] MVP scope/out-of-scope defined.

## Next Step

```text
Tech Spec v1.1
      ↓
Task Generator
      ↓
.agents/tasks/
      ↓
branch per feature/task group
      ↓
implementation
      ↓
test
      ↓
code review
      ↓
merge
```

---

# BAGIAN 18 — Compliance & Crisis Protocol

Turunan teknis dari PRD §15.1–15.3 dan §25.

## 18.1 Consent

```ts
type ConsentType = 'tos_privacy' | 'sensitive_processing' | 'analytics';
```

Aturan:

```text
tos_privacy          → required
sensitive_processing → required
analytics            → OPTIONAL, tidak boleh gating fitur inti
```

- satu baris `consent_records` per (`user_id`, `consent_type`, `document_version`);
- `granted=false` tetap dicatat — penolakan adalah data kepatuhan;
- pencabutan mengisi `revoked_at`, **bukan** menghapus baris;
- perubahan materiil dokumen → naikkan `document_version` → minta consent ulang saat login berikutnya;
- endpoint onboarding menolak request yang tidak menyertakan kedua consent wajib.

| Method | Path | Description |
|---|---|---|
| GET | `/me/consents` | status consent user |
| POST | `/me/consents` | grant/revoke consent tertentu |

## 18.2 Retention Jobs

Job terjadwal harian (BullMQ repeatable), satu job per entity, hasilnya dicatat di `retention_runs`:

```text
retention-posts            akun aktif + 30d grace pasca delete
retention-room-messages    12 bulan sejak sesi berakhir
retention-ai-messages      6 bulan
retention-safety           24 bulan (classifications, safety_events)
retention-moderation       24 bulan (cases, actions, reports, audit_logs)
retention-otp              24 jam
retention-sessions         90 hari (revoked)
retention-devices          180 hari (tidak aktif)
```

Aturan:

- job berjalan **batched** dengan limit per run agar tidak mengunci tabel;
- setiap run mencatat `deleted_count` — nol terus-menerus adalah sinyal job rusak, bukan sinyal aman;
- job **tidak pernah** menghapus baris yang terikat `moderation_cases` berstatus terbuka;
- backup rotasi 30 hari (§7.6) berarti penghapusan tidak instan lintas sistem — dinyatakan apa adanya di Privacy Policy.

## 18.3 Delete & Anonymize Account

```text
DELETE /me { mode: 'purge' | 'anonymize' }
        │
        ├── set users.deleted_at, deletion_mode
        ├── revoke semua session + hapus push token
        ├── listener availability → off, batalkan match terbuka
        │
        ├── purge     → grace 30 hari → hapus konten user
        └── anonymize → putuskan author_id → placeholder (IRREVERSIBLE)
```

- **`anonymize` tidak dapat dibatalkan** dan konten tidak bisa dihapus belakangan karena kaitannya sudah putus — UI wajib menyatakan ini sebelum konfirmasi;
- pesan private room **tidak** dihapus dari sisi lawan bicara sebelum retensi §18.2 habis;
- `audit_logs` dan `moderation_*` bertahan sesuai masa retensi (kewajiban kepatuhan, tidak memuat konten).

| Method | Path | Description |
|---|---|---|
| POST | `/me/export` | minta data export (JSON) |
| GET | `/me/export/:id` | status + signed URL, URL kedaluwarsa |

## 18.4 Breach Notification

UU PDP mewajibkan pemberitahuan tertulis dalam **3×24 jam**. Kesiapan teknis minimum:

```text
deteksi/laporan insiden
      ▼
containment + freeze credential
      ▼
tentukan lingkup: entity & jumlah subjek terdampak
  (butuh audit_logs + access log yang bisa di-query)
      ▼
notifikasi subjek data + lembaga berwenang  ≤ 3×24 jam
      ▼
post-mortem + perbaikan
```

Prasyarat yang harus ada **sebelum** insiden: PIC on-call, template notifikasi, dan kemampuan menjawab "siapa saja yang terdampak" dari log — tiga hal ini tidak bisa disiapkan dalam 72 jam.

## 18.5 Support Resources (Hotline)

- disimpan di tabel `support_resources`, dikelola dari admin, **tanpa deploy**;
- query runtime: `region = user.region AND is_active AND verified_at >= now() - 3 bulan`;
- kalau hasil kosong → tampilkan fallback jujur (DONG AI / Cari Listener / hubungi orang terdekat), **jangan** hardcode nomor cadangan di kode;
- seed awal wajib berisi entri terverifikasi — `⚠️ blocker rilis`, lihat PRD §15.2.

| Method | Path | Role |
|---|---|---|
| GET | `/support-resources?region=` | authenticated user |
| CRUD | `/admin/support-resources` | Super Admin |

## 18.6 Crisis Protocol L3 — Implementasi

```text
L3 terdeteksi (post | comment | ai_message | room message | listener escalate)
        │
        ├── safety_events (level=L3, resource_shown)
        ├── moderation_cases (queue=critical)
        ├── response ke client: safety.intervention  (SSE / WS / HTTP)
        ├── konten: post TIDAK masuk feed; message TETAP terkirim
        └── follow-up job: cek aktivitas user 24 jam kemudian
```

- kanal penyampaian: SSE event `safety.intervention` (§3.3), WS event `room:safety` (baru), atau field `intervention` pada response HTTP;
- payload intervention **tidak pernah** memuat level/skor risiko;
- **tidak ada** aksi punitive otomatis pada L3.

## 18.7 SLA Moderasi

| Queue | Siang 07–21 | Malam 21–04 |
|---|---|---|
| critical | 15 mnt | 30 mnt |
| high | 2 jam | 4 jam |
| medium | 12 jam | 12 jam |
| low | 48 jam | 48 jam |

- `moderation_cases` menyimpan `sla_due_at` yang dihitung saat pembuatan case;
- job `sla-watchdog` mengalerkan ops (Telegram, §10.2) saat case critical melewati `sla_due_at`;
- admin dashboard menampilkan SLA compliance sebagai metrik.

---

# BAGIAN 19 — Moderation Appeal

Turunan PRD §15.4. Ini fitur yang **belum ada sama sekali** di v1.1.

## 19.1 Model

```text
moderation_actions.is_appealable = true untuk:
remove | warn | mute | suspend | ban

approve dan escalate tidak appealable
Level 3 tidak menghasilkan aksi punitive → tidak ada yang dibanding
```

```text
moderation_appeals.status:
pending → under_review → upheld | overturned | reduced
```

## 19.2 Aturan

```text
window          : 14 hari sejak aksi
kuota           : 1 banding per action_id
SLA respons     : 7 hari
reviewer        : WAJIB != moderator yang memutus aksi
                  (tim kecil → naik ke Super Admin)
```

Penegakan `reviewer != decider` dilakukan di service layer **dan** dijaga oleh
constraint/check di database — ini aturan keadilan, bukan sekadar konvensi UI.

## 19.3 Endpoint

| Method | Path | Role |
|---|---|---|
| GET | `/me/moderation-actions` | user — daftar aksi terhadap dirinya + status banding |
| POST | `/appeals` | user — ajukan banding |
| GET | `/appeals/:id` | user — status & hasil |
| GET | `/admin/appeals` | Moderator+ (kecuali pemutus aksi terkait) |
| POST | `/admin/appeals/:id/decide` | Moderator+ / Super Admin |

## 19.4 Efek Keputusan

```text
overturned → pulihkan konten/akun, catat audit_logs, notifikasi user
reduced    → perpendek durasi mute/suspend
upheld     → aksi tetap, sampaikan dengan bahasa manusiawi
```

Rasio `overturned` per kategori dipantau di analytics: kategori dengan
`overturned` tinggi berarti **threshold AI moderation-nya yang salah**, bukan
usernya. Angka ini menjadi input kalibrasi di `/admin/ai/config`.

---

# CHANGELOG

## v1.2 — 12 Agustus 2026

### Added
- BAGIAN 18 — Compliance & Crisis Protocol (consent, retention jobs, delete/anonymize, breach, support resources, implementasi L3, SLA)
- BAGIAN 19 — Moderation Appeal (model, aturan, endpoint, efek keputusan)
- §4.3.1 safety level untuk `messages` dan `ai_messages`
- Entity: `consent_records`, `moderation_appeals`, `support_resources`, `felt_heard_prompts`, `listener_session_counters`, `data_export_requests`, `retention_runs`
- Field: `users.age_declared_at/deleted_at/deletion_mode`, `user_devices.quiet_hours_*`, `listener_profiles.guidelines_*`, `moderation_actions.is_appealable/appealed`, `messages.needs_reanalysis`
- §4.7: listener capacity, Felt Heard anti-fatigue, AI cost guard, quiet hours, age gate, consent, appeal, aksesibilitas

### Fixed
- §1.5 folder tree: tambah `profiles/` (sudah terdaftar di §1.4)

### Unchanged
- Seluruh keputusan stack BAGIAN 15 tetap LOCKED
- BAGIAN 16 safety architecture decision tetap berlaku; §4.3.1 memperluasnya ke pesan, tidak menggantikannya

## v1.1 — 12 Agustus 2026

### Updated
- Next.js → 16.3.x
- Expo → SDK 57
- Prisma → 7.x
- dependency pinning policy

### Added
- Resend transactional email adapter
- Cloudflare Turnstile
- provider-agnostic push token schema
- `otp_challenges`
- `listener_requests`
- `ai_usage_events`
- AI cost observability
- explicit token storage rules
- security log scrubbing
- AI timeout split between low-risk and high-risk

### Changed
- Android push default → Expo Push Service → FCM
- mobile Tailwind explicitly locked to 3.4.x with NativeWind 4.x
- production safety high-risk timeout → HOLD instead of global fail-open

### Retained
- NestJS modular monolith
- PostgreSQL 16
- Redis + BullMQ
- Socket.IO
- Vultr VPS
- Docker Compose
- Caddy
- GitHub Actions + GHCR
- S3-compatible object storage
- provider-agnostic AI Gateway

---

**Document Status:** `CURHAT DONG Tech Spec v1.2 — READY FOR TASK GENERATOR`
