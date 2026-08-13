#!/usr/bin/env bash
# Restore — E17-T07.
#
# Written to be run under pressure by somebody who did not write it. Every step
# prints what it is about to do, and the destructive one asks first.
set -euo pipefail

: "${BACKUP_BUCKET:?BACKUP_BUCKET belum diset}"
BACKUP_FILE="${1:-}"
TARGET_DB="${2:-curhat_dong_restore}"

if [ -z "$BACKUP_FILE" ]; then
  echo "usage: restore.sh <nama-file-backup> [nama-database-tujuan]"
  echo ""
  echo "Backup terakhir:"
  aws s3 ls "s3://${BACKUP_BUCKET}/daily/" \
    --endpoint-url "${BACKUP_ENDPOINT:-https://sgp1.vultrobjects.com}" | tail -5
  exit 2
fi

# The default target is a *separate* database, not the live one. A restore drill
# must not be one typo away from overwriting production.
if [ "$TARGET_DB" = "curhat_dong" ]; then
  echo "PERINGATAN: kamu akan menimpa database produksi."
  read -r -p "Ketik 'TIMPA PRODUKSI' untuk lanjut: " confirm
  [ "$confirm" = "TIMPA PRODUKSI" ] || { echo "dibatalkan"; exit 1; }
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[1/4] unduh $BACKUP_FILE"
aws s3 cp "s3://${BACKUP_BUCKET}/daily/${BACKUP_FILE}" "$WORKDIR/backup.age" \
  --endpoint-url "${BACKUP_ENDPOINT:-https://sgp1.vultrobjects.com}"

echo "[2/4] dekripsi (butuh private key age)"
age -d -i "${BACKUP_AGE_KEY_FILE:?BACKUP_AGE_KEY_FILE belum diset}" \
  -o "$WORKDIR/dump.sql" "$WORKDIR/backup.age"

echo "[3/4] buat database $TARGET_DB"
COMPOSE="$(dirname "$0")/../docker-compose.prod.yml"
docker compose -f "$COMPOSE" exec -T postgres \
  psql -U curhat -d postgres -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
docker compose -f "$COMPOSE" exec -T postgres \
  psql -U curhat -d postgres -c "CREATE DATABASE ${TARGET_DB} TEMPLATE template0 ENCODING 'UTF8';"

echo "[4/4] restore"
START=$(date +%s)
docker compose -f "$COMPOSE" exec -T postgres \
  psql -U curhat -d "$TARGET_DB" < "$WORKDIR/dump.sql"
END=$(date +%s)

echo ""
echo "selesai dalam $((END - START)) detik ke database ${TARGET_DB}"
echo "Catat durasi ini di RUNBOOK.md — angka itu yang dipakai memperkirakan RTO."
