---
id: E15-T02
epic: E15
title: Komponen inti — CurhatCard, ReactionBar, MoodChip, IntentBadge, CategoryChip
status: done
estimate: 2d
depends_on: [E15-T01]
refs: [DESIGN-REF §5 (1–5), PRD §9, §23.1]
---

## Scope
CurhatCard (varian default/butuh-didengar/anonymous/held), ReactionBar + ReactionPicker (6 reaksi berlabel kata), MoodChip (11) + MoodPicker, IntentBadge (4) + IntentSelector, CategoryChip + CategorySheet.

## Acceptance criteria
- Reaksi tampil sebagai **kata empati**, bukan ikon like.
- **Setiap ikon mood/reaction/intent punya label screen reader** (PRD §23.1) — tanpa ini interaksi inti tidak terbaca.
- Makna tidak disampaikan lewat warna saja.
- Reaction count bisa disembunyikan lewat prop.
- Touch target ≥44px.

## Verifikasi
Storybook/halaman contoh seluruh varian + audit screen reader.
