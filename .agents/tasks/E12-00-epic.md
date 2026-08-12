---
id: E12
title: Notification
status: done
tasks: 9
depends_on: [E03]
---

# E12 — Notification

Push provider-agnostic (Expo → FCM), web push, in-app, quiet hours.

**Definition of done:** notifikasi terkirim ke Android & web dengan payload **selalu generik**; quiet hours dihormati; tidak ada satu pun jalur kode yang bisa memasukkan isi curhat ke notifikasi.

**Aturan non-negotiable yang dijaga epic ini:** #3 (push tidak pernah memuat isi curhat/chat/AI).

**Refs:** PRD §14; TECH-SPEC BAGIAN 6, §3.4; DESIGN-REF §2.14
