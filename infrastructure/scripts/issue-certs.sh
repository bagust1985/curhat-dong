#!/usr/bin/env bash
# Terbitkan sertifikat untuk keempat host — E17-T01.
#
# Dijalankan **sekali**, sebelum `curhatdong.conf` dipasang. Wajib `sudo`.
#
# Script ini sengaja memakai `certbot certonly --webroot`, bukan `--nginx`:
# plugin nginx mengedit file config, dan di mesin yang melayani empat proyek
# lain, editor otomatis pada config nginx adalah risiko yang tidak sebanding
# dengan kenyamanannya. `certonly` tidak menyentuh config sama sekali.
set -euo pipefail

DOMAINS=(curhatdong.com www.curhatdong.com api.curhatdong.com admin.curhatdong.com)
EMAIL="${ACME_EMAIL:-}"
WEBROOT=/var/www/html
BOOTSTRAP=/etc/nginx/sites-available/curhatdong-bootstrap.conf
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo." >&2
  exit 1
fi

if [ -z "$EMAIL" ]; then
  echo "Set ACME_EMAIL dulu, mis: sudo ACME_EMAIL=kamu@contoh.com $0" >&2
  exit 1
fi

echo "[1/5] Pastikan nginx sekarang sehat"
# Kalau config-nya sudah rusak sebelum kita mulai, berhenti. Menambah file baru
# di atas config yang rusak bikin penyebabnya makin susah dicari.
nginx -t

echo "[2/5] Pasang bootstrap HTTP-only"
cp "$HERE/../nginx/curhatdong-bootstrap.conf" "$BOOTSTRAP"
ln -sf "$BOOTSTRAP" /etc/nginx/sites-enabled/curhatdong-bootstrap.conf
mkdir -p "$WEBROOT/.well-known/acme-challenge"
nginx -t
# reload, bukan restart: restart memutus koneksi empat proyek tetangga.
systemctl reload nginx

echo "[3/5] Uji coba (staging) — tidak memakan kuota Let's Encrypt"
args=()
for d in "${DOMAINS[@]}"; do args+=(-d "$d"); done

certbot certonly --webroot -w "$WEBROOT" "${args[@]}" \
  --email "$EMAIL" --agree-tos --no-eff-email --dry-run

echo ""
echo "[4/5] Uji coba lolos. Menerbitkan sertifikat sungguhan…"
certbot certonly --webroot -w "$WEBROOT" "${args[@]}" \
  --email "$EMAIL" --agree-tos --no-eff-email

echo "[5/5] Lepas bootstrap"
rm -f /etc/nginx/sites-enabled/curhatdong-bootstrap.conf
nginx -t
systemctl reload nginx

echo ""
echo "Sertifikat siap di /etc/letsencrypt/live/curhatdong.com/"
echo ""
echo "Langkah berikutnya:"
echo "  sudo cp $HERE/../nginx/curhatdong.conf /etc/nginx/sites-available/"
echo "  sudo ln -s /etc/nginx/sites-available/curhatdong.conf /etc/nginx/sites-enabled/"
echo "  sudo nginx -t && sudo systemctl reload nginx"
