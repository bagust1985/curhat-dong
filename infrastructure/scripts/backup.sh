#!/usr/bin/env bash
# Daily encrypted backup — E17-T07. TECH-SPEC §7.6.
#
# pg_dump → age-encrypt → Vultr Object Storage → prune beyond 30 days.
#
# Two rules this script exists to hold:
#
#  1. **The key never travels with the backup.** Encrypting with a key stored in
#     the same bucket is obfuscation, not encryption. `BACKUP_AGE_RECIPIENT` is a
#     public key; the private half lives in the team password manager and on
#     nothing that this script can reach.
#  2. **A backup that has never been restored is not a backup.** `restore.sh`
#     exists next to this file and the monthly drill is in RUNBOOK.md.
set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD belum diset}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (public key age) belum diset}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET belum diset}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="curhat-${STAMP}.sql.age"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[1/4] pg_dump"
# --no-owner so a restore into a fresh database does not need the same roles;
# that difference has cost more restore attempts than any other single thing.
docker compose -f "$(dirname "$0")/../docker-compose.prod.yml" exec -T postgres \
  pg_dump -U curhat -d curhat_dong --no-owner --clean --if-exists \
  > "$WORKDIR/dump.sql"

SIZE=$(wc -c < "$WORKDIR/dump.sql")
# A dump far smaller than yesterday's is the signature of a dump that failed
# halfway and exited 0 — worth failing loudly rather than uploading.
if [ "$SIZE" -lt 10000 ]; then
  echo "ERROR: dump cuma ${SIZE} byte — kelihatannya gagal, tidak diupload" >&2
  exit 1
fi

echo "[2/4] enkripsi (${SIZE} byte)"
age -r "$BACKUP_AGE_RECIPIENT" -o "$WORKDIR/$NAME" "$WORKDIR/dump.sql"
# The plaintext dump never leaves this machine and never outlives the script.
shred -u "$WORKDIR/dump.sql" 2>/dev/null || rm -f "$WORKDIR/dump.sql"

echo "[3/4] upload"
aws s3 cp "$WORKDIR/$NAME" "s3://${BACKUP_BUCKET}/daily/${NAME}" \
  --endpoint-url "${BACKUP_ENDPOINT:-https://sgp1.vultrobjects.com}"

echo "[4/4] prune > ${RETENTION_DAYS} hari"
CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d)
aws s3 ls "s3://${BACKUP_BUCKET}/daily/" \
  --endpoint-url "${BACKUP_ENDPOINT:-https://sgp1.vultrobjects.com}" \
  | awk '{print $4}' | while read -r file; do
  [ -z "$file" ] && continue
  stamp="${file#curhat-}"; stamp="${stamp%%T*}"
  if [ "$stamp" \< "$CUTOFF" ]; then
    aws s3 rm "s3://${BACKUP_BUCKET}/daily/${file}" \
      --endpoint-url "${BACKUP_ENDPOINT:-https://sgp1.vultrobjects.com}"
    echo "  dihapus: $file"
  fi
done

echo "selesai: ${NAME}"
