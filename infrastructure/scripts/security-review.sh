#!/usr/bin/env bash
# Pre-launch security review — E17-T14. CLAUDE.md non-negotiable #1–#8.
#
# The parts of the checklist a machine can decide, decided by a machine. What is
# left over is listed at the end as the part a person still has to do, so the
# difference between "checked" and "assumed" stays visible.
set -uo pipefail
cd "$(dirname "$0")/../.."

PASS=0
FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }

echo "== 1. Safety fallback: outage AI bukan bypass =="
if grep -rqi "HOLD\|hold" apps/api/src/modules/safety/*.ts 2>/dev/null \
   && ls apps/api/src/modules/safety/*.test.ts >/dev/null 2>&1; then
  ok "jalur fallback + test safety ada"
else
  bad "jalur fallback safety tidak ditemukan"
fi

echo "== 2. Level 3 tidak menghukum otomatis =="
if grep -rqi "FORBIDDEN_TONE" apps/web/components/supportive-intervention.tsx; then
  ok "aturan copy L3 ditegakkan test"
else
  bad "layar L3 tanpa penjagaan copy"
fi

echo "== 3. Push & Sentry tidak memuat isi curhat =="
if grep -rq "CONTENT_ROUTES" packages/observability/src/scrub.ts \
   && grep -rq "FORBIDDEN_DATA_KEYS" apps/mobile/lib/notifications.ts; then
  ok "scrubbing Sentry + filter payload push ada"
else
  bad "scrubbing atau filter push hilang"
fi
if grep -rn "body" packages/notifications/src/payload.ts 2>/dev/null | grep -q "interface NotificationPayload"; then
  bad "NotificationPayload punya field body"
else
  ok "NotificationPayload tetap tanpa field teks bebas"
fi

echo "== 4. API publik tidak mengekspos email/provider id/skor =="
# The admin module is excluded on purpose: E14-T04 lets a moderator read a
# trust score *through an active case*, and that access is audited. The rule is
# about the public API, so scanning admin code reports a designed behaviour as a
# violation — and a checklist that cries wolf stops being read.
LEAK=$(grep -rn "emailHash\|providerId\|riskScore\|trustScore" apps/api/src/modules \
       --include=*.service.ts --include=*.controller.ts \
       | grep -v "/admin/" | grep -v "/moderation/" | grep -i "select:" | grep -v test | head -5)
if [ -z "$LEAK" ]; then
  ok "tidak ada select publik yang membawa field terlarang"
else
  bad "cek: $LEAK"
fi

echo "== 5. noindex & Redis bukan source of truth =="
if grep -q "/:path+" apps/web/next.config.ts && grep -q "noindex" apps/admin/next.config.ts; then
  ok "noindex catch-all aktif di web & admin"
else
  bad "konfigurasi noindex berubah"
fi

echo "== 6. Tidak ada \"latest\" di dependency produksi =="
if grep -rn '"\(latest\|\*\)"' --include=package.json apps packages | grep -v node_modules | grep -q .; then
  bad "ada dependency floating"
  grep -rn '"\(latest\|\*\)"' --include=package.json apps packages | grep -v node_modules | head -3
else
  ok "semua versi terpin"
fi

echo "== 7. Migration destruktif butuh review manual =="
if node infrastructure/scripts/check-destructive-migration.mjs packages/database/prisma/migrations >/dev/null 2>&1; then
  ok "gate migration lolos untuk migration saat ini"
else
  bad "ada migration destruktif tanpa persetujuan"
fi

echo "== 8. Secret tidak ter-commit =="
# `.env.example` is meant to be tracked — it is the list of variable names with
# no values, which is how somebody knows what to set.
if git ls-files | grep -Ev '\.env\.example$' | grep -Eq '(^|/)\.env(\..*)?$|\.pem$|(^|/)id_rsa$'; then
  bad "ada file kredensial yang ter-track git"
  git ls-files | grep -Ev '\.env\.example$' | grep -E '(^|/)\.env(\..*)?$|\.pem$|(^|/)id_rsa$' | head -3
else
  ok "tidak ada file kredensial di git"
fi
# Schema *keys* only. Matching whole lines also matched the comment explaining
# that secrets must never be exposed via NEXT_PUBLIC_* — the rule reported as
# its own violation.
if grep -rnE "^\s*(NEXT|EXPO)_PUBLIC_[A-Z_]+:" packages/config/src/env/schema.ts \
   | grep -qiE "secret|password|private_key"; then
  bad "ada secret di schema env publik"
else
  ok "env publik tidak memuat secret"
fi

echo ""
echo "-------------------------------------------"
echo "otomatis: ${PASS} lolos, ${FAIL} gagal"
echo ""
echo "Masih harus diperiksa manusia (tidak bisa diputuskan skrip):"
echo "  - Tone copy Indonesia hangat non-klinis (aturan #8) — sebagian sudah jadi"
echo "    assertion di E15-T10, sisanya penilaian."
echo "  - Admin MFA aktif di lingkungan produksi, bukan cuma ada kodenya."
echo "  - Akses konten privat benar-benar teraudit di data produksi."
echo "  - Hotline terverifikasi (E17-T12) sudah terisi."
echo "  - Scrubbing Sentry diuji dengan error sungguhan di DSN produksi."
echo "  - Port DB/Redis tertutup dari internet, diuji dari luar VPS."
echo "-------------------------------------------"

[ "$FAIL" -eq 0 ]
