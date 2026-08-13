---
id: E15-T14
epic: E15
title: Cari Listener + Private Room + Session Feedback
status: done
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

## Catatan implementasi

- Tombol **Escalate selalu ter-render** (bukan di menu), dan hanya untuk sisi
  listener yang punya sessionId. Diuji juga bahwa tidak ada kontrol "⋯" yang
  menyembunyikannya.
- Searching state tidak menjanjikan apa pun; estimasinya jujur-kabur karena
  jumlah listener yang bangun memang tidak bisa dijanjikan.
- Pesan dikirim via HTTP (yang menyimpan) dan diterima via socket (yang bikin
  lawan bicara lihat sekarang). Echo di-dedupe supaya tidak dobel.
- **Bug yang ditemukan test sendiri:** kalau respons POST pesan tidak membawa
  `id`, pesan jadi ber-id `undefined` dan seluruh room crash di jalur dedupe.
  Sekarang fallback ke id lokal.
- Feedback dua arah: requester ditanya merasa didengar, listener ditanya apakah
  percakapan aman — sinyal keamanan, bukan rating orangnya.
