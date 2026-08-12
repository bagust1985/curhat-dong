---
id: E11-T07
epic: E11
title: Akhiri sesi & idle timeout
status: todo
estimate: 1d
depends_on: [E11-T04]
refs: [TECH-SPEC §3.4, PRD §11]
---

## Scope
`POST /rooms/:id/close`, event `room:closed`, idle timeout, catat `end_reason`.

## Acceptance criteria
- Kedua pihak bisa mengakhiri sesi kapan saja.
- Penutupan memicu counter listener (cap harian + cooldown, E10-T09).
- Idle timeout menutup sesi dengan sopan, bukan menghilang begitu saja.
- Room tertutup jadi read-only, riwayat tetap ada sesuai retensi.

## Verifikasi
Test: close dari kedua sisi; verifikasi counter & cooldown listener bertambah.
