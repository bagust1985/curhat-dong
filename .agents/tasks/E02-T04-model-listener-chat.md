---
id: E02-T04
epic: E02
title: Model listener & chat
status: todo
estimate: 1d
depends_on: [E02-T02]
refs: [TECH-SPEC §2.2, PRD §11, §11.2]
---

## Scope
`listener_profiles`, `listener_availability`, `listener_requests`, `listener_matches`, `listener_sessions`, `listener_session_counters` (v1.2), `chat_rooms`, `room_members`, `messages`.

Field v1.2: `listener_profiles.guidelines_version_accepted/accepted_at`, `messages.needs_reanalysis`.

## Acceptance criteria
- `listener_matches.expires_at` untuk TTL offer 60 detik.
- `listener_session_counters(user_id, date)` unik — dasar cap 8 sesi/hari + cooldown.
- `messages` menyimpan `safety_level`; isi pesan tidak pernah masuk log/analitik generik.
- `room_members` menegakkan keanggotaan — jadi dasar cek otorisasi WS (TECH-SPEC §3.5).

## Verifikasi
Migration jalan; test unique constraint counter harian.
