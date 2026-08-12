---
id: E03
title: Auth & Session
status: done
tasks: 12
depends_on: [E02]
---

# E03 — Auth & Session

Email OTP + Google OAuth, JWT 15 menit, rotating refresh dengan reuse detection, Turnstile, rate limit.

**Definition of done:** user bisa daftar/masuk lewat OTP dan Google; token berotasi aman; token lama yang dipakai ulang mematikan seluruh family; email tidak pernah tersimpan plaintext atau tampil di API publik.

**Refs:** TECH-SPEC §3.1, BAGIAN 5, §7.3, §7.5; PRD §4
