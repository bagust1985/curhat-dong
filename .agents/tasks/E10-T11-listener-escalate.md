---
id: E10-T11
epic: E10
title: Tombol escalate listener → moderator
status: todo
estimate: 1d
depends_on: [E10-T07, E07-T07]
refs: [PRD §11.3, DESIGN-REF §2.11]
---

## Scope
Escalate dari room → `safety_event` + case Critical + tampilkan resources ke requester + panduan singkat untuk listener.

## Acceptance criteria
- Tombol **selalu terlihat** di room, bukan di menu tersembunyi.
- Sesi **tidak** ditutup otomatis dan requester **tidak** diblokir/dihukum (PRD §11.3).
- Listener boleh keluar setelah escalate **tanpa penalti**, dan mendapat follow-up ringan.
- Panduan on-screen: tetap hadir, jangan menjanjikan penyelamatan, jangan berjanji merahasiakan hal yang membahayakan nyawa.

## Verifikasi
Integration: escalate → case Critical + resources tampil + skor listener tidak turun.
