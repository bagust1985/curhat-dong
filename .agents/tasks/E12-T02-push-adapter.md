---
id: E12-T02
epic: E12
title: Push adapter — Expo Push Service
status: todo
estimate: 1.5d
depends_on: [E12-T01]
refs: [TECH-SPEC §6.1]
---

## Scope
Interface `PushProvider` + implementasi Expo Push; tangani token invalid/unregistered.

## Acceptance criteria
- Jalur migrasi ke direct FCM tersedia tanpa mengubah domain code.
- Token yang ditolak provider otomatis dinonaktifkan.
- Batching untuk pengiriman massal.

## Verifikasi
Test dengan adapter palsu + satu kiriman nyata ke device dev.
