#!/usr/bin/env bash
#
# Port preflight for CURHAT DONG.
#
# This VPS is shared with other projects. Starting a container that grabs a
# port another project is serving from would take that project down, so this
# refuses to proceed instead of letting Docker fail halfway through.
#
# Usage: infrastructure/scripts/check-ports.sh

set -euo pipefail

# Keep in sync with infrastructure/PORTS.md and .env.example.
declare -A PORTS=(
  [3100]="Web (Next.js)"
  [3101]="API (NestJS)"
  [3102]="Admin (Next.js)"
  [54329]="PostgreSQL"
  [63799]="Redis"
)

listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -qE "[:.]${1}[[:space:]]"
  else
    netstat -tln 2>/dev/null | grep -qE "[:.]${1}[[:space:]]"
  fi
}

conflicts=0

echo "Preflight port CURHAT DONG"
echo

for port in $(printf '%s\n' "${!PORTS[@]}" | sort -n); do
  if listening "$port"; then
    printf '  %-7s %-20s BENTROK — sudah dipakai proses lain\n' "$port" "${PORTS[$port]}"
    conflicts=$((conflicts + 1))
  else
    printf '  %-7s %-20s bebas\n' "$port" "${PORTS[$port]}"
  fi
done

echo

if [ "$conflicts" -gt 0 ]; then
  cat >&2 <<'EOF'
Ada port yang bentrok. JANGAN dipaksa jalan.

Cari tahu siapa pemakainya:
  ss -tlnp | grep <port>

Lalu pilih salah satu:
  - matikan proses itu kalau memang punya kita, atau
  - ganti port CURHAT DONG di infrastructure/PORTS.md,
    infrastructure/docker-compose.dev.yml, dan .env

VPS ini dipakai bersama proyek lain — merebut port berarti mematikan
layanan orang.
EOF
  exit 1
fi

echo "Semua port bebas. Aman dinyalakan."
