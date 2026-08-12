---
id: E12-T04
epic: E12
title: Penjaga privasi payload notifikasi
status: todo
estimate: 1d
depends_on: [E12-T02]
refs: [PRD §14, TECH-SPEC §6.2, CLAUDE.md non-negotiable #3]
---

## Scope
Katalog template notifikasi tertutup; builder payload yang **hanya** menerima template + id, tidak menerima teks bebas.

## Acceptance criteria
- **Isi curhat/chat/AI tidak pernah masuk notifikasi** (non-negotiable #3).
- Diperkuat oleh tipe: fungsi kirim tidak punya parameter untuk teks bebas — kalau seseorang mencoba, kodenya tidak compile.
- Template yang diizinkan: "Ada seseorang yang membalas curhatmu.", "Ada seseorang yang sedang butuh didengar.", "Listener tersedia untukmu."
- Privasi lock screen adalah requirement default.

## Verifikasi
**Test wajib**: coba kirim payload berisi isi post → ditolak/tidak mungkin secara tipe. Test ini melindungi non-negotiable #3.
