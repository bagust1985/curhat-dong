---
id: E16-T07
epic: E16
title: Private room (mobile) + FLAG_SECURE
status: todo
estimate: 2d
depends_on: [E16-T06, E11-T03]
refs: [DESIGN-REF §2.11, PRD §15]
---

## Scope
Socket.IO di RN, typing/presence, header aksi termasuk Escalate, FLAG_SECURE.

## Acceptance criteria
- **FLAG_SECURE aktif di private room** bila didukung perangkat.
- Disclaimer jujur: jangan janjikan screenshot 100% mustahil.
- Reconnect otomatis setelah jaringan putus, tanpa pesan ganda.
- Tombol Escalate selalu terlihat.

## Verifikasi
Coba screenshot di room pada device fisik; uji reconnect.
