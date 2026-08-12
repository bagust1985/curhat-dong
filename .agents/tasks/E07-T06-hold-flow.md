---
id: E07-T06
epic: E07
title: Alur HOLD (L2) & pemberitahuan ke user
status: todo
estimate: 1d
depends_on: [E07-T04]
refs: [PRD §8, DESIGN-REF §2.5, §2.6]
---

## Scope
Status `held` + copy "Curhatmu kami tinjau dulu sebentar ya" + notifikasi hasil review.

## Acceptance criteria
- Post `held` hanya terlihat authornya.
- Copy hangat, tidak menuduh — user belum tentu bersalah.
- Setelah moderator memutuskan: publish atau remove + alasan + **info cara banding** (PRD §15.4).

## Verifikasi
Integration: post L2 → held → moderator approve → published + user diberi tahu.
