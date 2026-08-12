---
id: E15-T09
epic: E15
title: Create curhat (modal web)
status: todo
estimate: 2d
depends_on: [E15-T02, E05-T02]
refs: [DESIGN-REF §2.6, PRD §7]
---

## Scope
Prompt "Hari ini kamu mau cerita apa?", title opsional, body autosave, category sheet, mood picker (11), intent selector (4), toggle anonymity/comments/cari-listener, warning anti-doxxing, state hasil submit.

## Acceptance criteria
- Warning doxxing **inline sebelum submit**, user tetap boleh lanjut.
- State submit: publish sukses / held ("Curhatmu kami tinjau dulu sebentar ya") / L3 → layar Supportive Intervention.
- Draft autosave lokal, pulih setelah app ditutup.

## Verifikasi
Uji ketiga state hasil submit; uji pemulihan draft.
