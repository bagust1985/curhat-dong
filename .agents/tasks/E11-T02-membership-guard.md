---
id: E11-T02
epic: E11
title: Cek membership di setiap event sensitif
status: todo
estimate: 1d
depends_on: [E11-T01]
refs: [TECH-SPEC §3.5]
---

## Scope
Guard yang memverifikasi `room_members` untuk `room:join`, `room:message`, `room:typing`, `room:leave`.

## Acceptance criteria
- **Server wajib mengecek membership setiap event sensitif** (TECH-SPEC §3.5) — bukan sekali saat join lalu dipercaya.
- User yang sudah `left_at` tidak bisa mengirim apa pun.
- Blokir dua arah memutus akses room.

## Verifikasi
Test: kirim `room:message` dengan roomId orang lain → ditolak. Ini test keamanan wajib.
