# CURHAT DONG — Task Breakdown

> Turunan dari `1-PRD.md` v1.1 + `2-TECH-SPEC.md` v1.2 + `3-DESIGN-REFERENCE.md` v1.1.
> Scope: **MVP Phase 1** (Web + Android APK/AAB + Admin + API).
> Dibuat 12 Agustus 2026.

## Konvensi

**Nama file:** `E{NN}-T{NN}-{slug}.md` · epic overview: `E{NN}-00-epic.md`

**Frontmatter wajib:**

```yaml
---
id: E03-T04
epic: E03
title: Rotating refresh token + reuse detection
status: todo          # todo | in_progress | blocked | done
estimate: 1.5d
depends_on: [E03-T03]
refs:
  - TECH-SPEC §5.1
  - CLAUDE.md non-negotiable
---
```

**Body:** `## Scope` · `## Acceptance criteria` · `## Out of scope` · `## Verifikasi`

**Aturan kerja:**
- 1 branch per task group, conventional commits (`feat(auth): ...`).
- Update `status` di file task saat mulai & selesai.
- Task yang ternyata lebih dari 2 hari → pecah dulu, jangan dikerjakan utuh.
- Semua kode & komentar English; copy UI Bahasa Indonesia.

## Blocker rilis (di luar coding)

Dua hal ini **bukan** task engineering tapi menahan go-live. Kerjakan paralel sejak awal:

1. **Daftar hotline Indonesia terverifikasi** (PRD §15.2) — tanpa ini layar krisis kosong.
2. **Pendaftaran PSE** (PRD §25.1) — prosedur wajib diverifikasi ke sumber resmi terkini.

Plus: naskah Privacy Policy / ToS / Community Guidelines (butuh review hukum), dan kepastian **rotasi moderator malam** untuk memenuhi SLA Critical (PRD §15.3).

## Peta Epic

| Epic | Nama | Task | Tergantung pada |
|---|---|---|---|
| [E01](E01-00-epic.md) | Foundation & Tooling | 10 | — |
| [E02](E02-00-epic.md) | Database & Prisma | 9 | E01 |
| [E03](E03-00-epic.md) | Auth & Session | 12 | E02 |
| [E04](E04-00-epic.md) | Onboarding, Consent & Identity | 8 | E03 |
| [E05](E05-00-epic.md) | Post & Feed | 12 | E04 |
| [E06](E06-00-epic.md) | Interaction & Felt Heard | 8 | E05 |
| [E07](E07-00-epic.md) | Safety Engine & Moderation Core | 14 | E05, E08 |
| [E08](E08-00-epic.md) | AI Gateway | 9 | E02 |
| [E09](E09-00-epic.md) | DONG AI | 8 | E07, E08 |
| [E10](E10-00-epic.md) | Listener & Matching | 11 | E07 |
| [E11](E11-00-epic.md) | Private Chat Room | 9 | E10 |
| [E12](E12-00-epic.md) | Notification | 9 | E03 |
| [E13](E13-00-epic.md) | Search | 4 | E05 |
| [E14](E14-00-epic.md) | Admin Panel | 15 | E07 |
| [E15](E15-00-epic.md) | Web UI | 17 | E05, E06 |
| [E16](E16-00-epic.md) | Mobile (Android) | 13 | E15 |
| [E17](E17-00-epic.md) | Compliance, Deploy & Observability | 14 | E01 |

**Total: 182 task** (+17 file epic).

## Urutan Eksekusi

```
E01 ──► E02 ──┬──► E03 ──► E04 ──► E05 ──► E06 ──► E13
              │                      │
              └──► E08 ──────────────┴──► E07 ──┬──► E09
                                                ├──► E10 ──► E11
                                                └──► E14
              E03 ──► E12
              E05, E06 ──► E15 ──► E16
E01 ──► E17 (nyicil sepanjang proyek, jangan ditinggal di ujung)
```

**Jalur kritis:** E01 → E02 → E03 → E05 → E07 → E10 → E11.
Itu jalur yang menghasilkan core loop PRD §21: *cerita → didengar → merasa didengar → kembali*.

**Catatan urutan:**
- **E07 (Safety) wajib selesai sebelum E09 (DONG AI) dirilis.** AI yang jalan tanpa safety engine melanggar aturan non-negotiable #1.
- E08 bisa mulai paralel dengan E03 — cuma butuh database.
- E17 jangan ditumpuk di akhir: CI, Sentry scrubbing, dan backup harus ada sebelum ada data user sungguhan.
- E15/E16 boleh mulai dari komponen & halaman statis sebelum API-nya siap.

## Definisi Selesai MVP (PRD §23)

User bisa: buat akun anonim → cerita → dapat respons manusia → ngobrol DONG AI →
minta listener → private conversation → bilang "gue merasa didengar" — aman,
lewat Web dan Android APK.
