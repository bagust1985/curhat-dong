---
id: E12-T09
epic: E12
title: Listener nudge + rate control
status: todo
estimate: 1d
depends_on: [E12-T06]
refs: [PRD §14, §23, DESIGN-REF §2.4]
---

## Scope
Nudge ke listener available saat ada post "Butuh Didengar" atau request menunggu.

## Acceptance criteria
- Ada batas frekuensi per listener per hari — nudge berlebihan adalah cara tercepat kehilangan listener.
- Tunduk pada quiet hours (nudge **bukan** notifikasi safety).
- Tidak dikirim ke listener yang sedang cooldown atau sudah kena cap harian.
- Payload generik, tidak menyebut isi curhat.

## Verifikasi
Test: listener kena cap harian → tidak menerima nudge; test batas frekuensi.
