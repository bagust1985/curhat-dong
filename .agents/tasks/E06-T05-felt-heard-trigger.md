---
id: E06-T05
epic: E06
title: Trigger & anti-fatigue prompt Felt Heard
status: done
estimate: 1.5d
depends_on: [E06-T02]
refs: [PRD §9, §19.1, TECH-SPEC §4.6, §4.7]
---

## Scope
Buat `felt_heard_prompts` saat post dapat ≥1 respons manusia atau sesi listener selesai; tegakkan aturan frekuensi.

## Acceptance criteria
- Max 1× per post & per sesi; max 3×/hari/user; delay 30 menit setelah respons pertama.
- Bisa di-dismiss (tidak diulang untuk target sama) dan dimatikan permanen dari Settings.
- **Reaksi saja tidak memicu prompt** — hanya respons manusia bermakna (komentar/sesi).
- Nilai batas dibaca dari `app_configs`.

## Verifikasi
Unit test aturan frekuensi termasuk batas harian dan lintas hari.
