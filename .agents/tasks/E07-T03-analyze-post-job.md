---
id: E07-T03
epic: E07
title: Worker job analyze-post
status: done
estimate: 1.5d
depends_on: [E07-T01, E08-T03]
refs: [TECH-SPEC §4.1, §1.4]
---

## Scope
Job BullMQ: ambil post `pending_analysis` → AI Gateway (emotion, topic, intent, urgency, risk) → safety mapping → transisi status.

## Acceptance criteria
- Jalan di container worker terpisah (TECH-SPEC §1.4).
- Idempoten — retry tidak menghasilkan case ganda.
- Menyimpan `ai_classifications` lengkap dengan `prompt_version`.
- Timeout ditangani sesuai E07-T05, bukan digantung selamanya.

## Verifikasi
Integration: create post → job jalan → status berubah sesuai level.

> **Catatan E07 (12 Agu 2026):** logika analisis dan re-analisis sudah selesai
> dan teruji (`ContentAnalyzerService`, `ReanalysisService`). Yang belum:
> pembungkusnya sebagai **BullMQ repeatable job di container worker terpisah**
> — itu butuh worker container yang baru ada di **E17-T02**. Saat ini analisis
> berjalan inline pada request create, dan re-analisis dipanggil sebagai
> service. Perilakunya identik; yang berubah nanti cuma di mana ia dijalankan.
