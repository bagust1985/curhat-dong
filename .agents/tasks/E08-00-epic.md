---
id: E08
title: AI Gateway
status: done
tasks: 9
depends_on: [E02]
---

# E08 — AI Gateway

Lapisan abstraksi provider-agnostic dengan model routing, prompt versioning, dan cost guard.

**Definition of done:** ganti provider AI tanpa menyentuh domain code; setiap panggilan tercatat biayanya; budget guard aktif — **dan tidak pernah mendegradasi klasifikasi safety**.

**Refs:** PRD §10 (AI Cost Guard); TECH-SPEC §4.4, §10.3, §4.7
