---
id: E09-T03
epic: E09
title: SSE streaming balasan
status: done
estimate: 1.5d
depends_on: [E09-T02]
refs: [TECH-SPEC §3.3]
---

## Scope
`POST /ai/conversations/:id/messages` dengan event: `message.start`, `message.delta`, `message.complete`, `safety.intervention`, `error`.

## Acceptance criteria
- Koneksi putus di tengah stream tidak meninggalkan pesan setengah jadi yang tersimpan sebagai final.
- Heartbeat agar proxy tidak memutus koneksi.
- Token usage dicatat setelah `message.complete`.

## Verifikasi
Test: putuskan koneksi di tengah → state pesan konsisten; verifikasi urutan event.
