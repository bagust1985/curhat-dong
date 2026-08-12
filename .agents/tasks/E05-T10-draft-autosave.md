---
id: E05-T10
epic: E05
title: Draft autosave lokal
status: blocked
estimate: 0.5d
depends_on: [E05-T02]
refs: [DESIGN-REF §2.6]
---

## Scope
Autosave draft di perangkat (local storage / async storage), pulihkan saat composer dibuka lagi.

## Acceptance criteria
- Draft **lokal saja**, tidak dikirim ke server sebelum submit — curhat setengah jadi bukan milik server.
- Draft dihapus setelah submit sukses.

## Verifikasi
Manual: tulis draft → tutup app → buka lagi → draft kembali.

> **Catatan E05 (12 Agu 2026):** task ini murni client-side — draft disimpan di
> perangkat dan sengaja tidak pernah dikirim ke server sebelum submit, jadi API
> tidak punya bagian di sini. Dikerjakan bersama composer di **E15-T09** (web)
> dan **E16-T05** (mobile). Ditandai `blocked`, bukan `done`, supaya tidak
> terhitung selesai padahal belum ada kodenya.
