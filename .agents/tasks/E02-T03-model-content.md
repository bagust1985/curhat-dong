---
id: E02-T03
epic: E02
title: Model konten — posts, comments, reactions, categories
status: todo
estimate: 1d
depends_on: [E02-T02]
refs: [TECH-SPEC §2.2, §2.3, PRD §7, §9]
---

## Scope
`post_categories`, `curhat_posts`, `comments`, `reactions`, `felt_heard_feedback`, `felt_heard_prompts` (v1.2), `mood_entries`.

## Acceptance criteria
- `curhat_posts.status` enum: `draft|pending_analysis|published|held|removed|deleted`.
- `safety_level` enum L0–L3 + state `pending`.
- `reactions` polymorphic (`target_type`,`target_id`) + unique per (user, target, type).
- `comments.parent_id` nested **1 level saja** (PRD §9).
- `felt_heard_prompts` menyimpan `dismissed` terpisah dari `answer` — dismissed **tidak** boleh dihitung sebagai "Belum" (PRD §9).

## Verifikasi
Test: reaction ganda ditolak; reply ke reply ditolak; `dismissed` dan `answer='no'` terbedakan.
