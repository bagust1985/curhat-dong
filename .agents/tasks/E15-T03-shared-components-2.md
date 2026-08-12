---
id: E15-T03
epic: E15
title: Komponen — CommentItem, ChatBubble, ListenerCard, EmptyState, BottomNav+FAB
status: todo
estimate: 1.5d
depends_on: [E15-T02]
refs: [DESIGN-REF §5 (6–8, 13–14)]
---

## Scope
CommentItem (+ helpful badge, nested 1 level), ChatBubble (room & AI, varian streaming), ListenerCard, EmptyState ilustrasi hangat per konteks, BottomNav + FAB "+ Curhat".

## Acceptance criteria
- Empty state hangat & kontekstual ("Belum ada yang cerita di sini. Mau jadi yang pertama?"), bukan pesan sistem kosong.
- ChatBubble streaming tidak "melompat" saat token masuk.
- ~~Nav: HOME · EXPLORE · [+ CURHAT] · LISTEN · PROFILE.~~ **Digantikan
  keputusan user (12 Agt 2026):** nav mengikuti mock — Beranda · Chat ·
  Komunitas (disabled, Phase 2) · Notifikasi · Akun. `+ Curhat` tetap sebagai
  FAB; EXPLORE dan LISTEN dijangkau dari Beranda supaya tidak ada fitur MVP
  yang tidak bisa diakses.

## Verifikasi
Halaman contoh seluruh varian; uji streaming bubble dengan teks panjang.
