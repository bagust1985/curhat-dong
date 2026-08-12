---
id: E15-T14
epic: E15
title: Cari Listener + Private Room + Session Feedback
status: todo
estimate: 2d
depends_on: [E15-T13, E11-T08]
refs: [DESIGN-REF §2.10, §2.11]
---

## Scope
Form request + searching state, matched, gagal/timeout; room realtime dengan typing/presence, header (Report/Block/Akhiri Sesi/**Escalate**), safety notice, session feedback dua arah.

## Acceptance criteria
- Searching state tenang: "Lagi nyariin orang yang tepat buat dengerin kamu…" + estimasi realistis.
- Gagal → empati + 3 alternatif, **tanpa menjanjikan** listener pasti ada.
- Tombol Escalate **selalu terlihat**, bukan di menu tersembunyi.
- Thank-you state: "Makasih udah mau dengerin 🤍".

## Verifikasi
Uji alur penuh dua pihak; uji state gagal matching.
