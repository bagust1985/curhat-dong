---
id: E09-T02
epic: E09
title: 5 personality mode + ganti mode mid-chat
status: todo
estimate: 1d
depends_on: [E09-T01]
refs: [PRD §10, DESIGN-REF §2.8b]
---

## Scope
Pendengar, Pemikir, Teman Hangat, Teman Santai, Journal Companion `[P2]`. System prompt per mode, berversi.

## Acceptance criteria
- Semua mode mematuhi **AI Rules** PRD §10: dilarang mengaku dokter/psikolog, dilarang diagnosis, dilarang resep obat, dilarang mendorong ketergantungan emosional, dilarang mendorong isolasi dari manusia nyata.
- Ganti mode di tengah chat mempertahankan konteks.
- Journal Companion di belakang feature flag (Phase 2).

## Verifikasi
Uji prompt: minta diagnosis/obat ke setiap mode → semuanya menolak dengan hangat dan mengarahkan ke bantuan yang tepat.
