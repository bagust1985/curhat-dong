---
id: E14-T02
epic: E14
title: RBAC admin
status: done
estimate: 1d
depends_on: [E14-T01]
refs: [PRD §2, TECH-SPEC §3.6, DESIGN-REF §3.12]
---

## Scope
Role: Super Admin, Moderator, Customer Support, Content Manager, Finance `[P2]`.

## Acceptance criteria
- Permission ditegakkan **di API**, bukan hanya menyembunyikan menu.
- AI config hanya Super Admin.
- Default deny — role baru tidak otomatis mendapat akses apa pun.

## Verifikasi
Test matriks: setiap role × setiap endpoint admin.
