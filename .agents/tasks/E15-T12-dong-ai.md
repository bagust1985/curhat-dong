---
id: E15-T12
epic: E15
title: Halaman DONG AI
status: done
estimate: 2d
depends_on: [E15-T03, E09-T03]
refs: [DESIGN-REF §2.8]
---

## Scope
List percakapan, pilih personality, chat streaming, disclaimer permanen, AI→Human Bridge card, in-chat safety resources, indikator kuota.

## Acceptance criteria
- Streaming halus dengan typing indicator.
- Disclaimer "DONG AI teman ngobrol, bukan psikolog" selalu terlihat.
- Kuota habis → copy hangat + CTA Cari Listener.
- Bridge card kontekstual, tidak muncul di setiap balasan.

## Verifikasi
Uji streaming, ganti mode mid-chat, dan state kuota habis.

## Catatan implementasi

- SSE dibaca lewat `fetch` + parser frame sendiri, bukan `EventSource`:
  stream-nya dibuka dengan POST (pesannya di body) dan butuh header
  `Authorization` — dua hal yang `EventSource` nggak bisa.
- Balasan **baru masuk daftar pesan saat `message.complete`**. Stream yang putus
  di tengah nggak meninggalkan sesuatu yang kelihatan seperti jawaban selesai.
- Disclaimer di luar thread dan tanpa tombol tutup — harus kebaca di pesan
  ke-40, bukan cuma di atas.
- Bridge card muncul hanya kalau frame complete membawanya (keputusan server).
  Muncul tiap balasan bikin dia berhenti jadi tawaran.
- Frame rusak dibuang satuan, bukan menggagalkan seluruh balasan; komentar
  `: ping` diabaikan.
