#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

cloudflare_ranges=(
  "173.245.48.0/20"
  "103.21.244.0/22"
  "103.22.200.0/22"
  "103.31.4.0/22"
  "141.101.64.0/18"
  "108.162.192.0/18"
  "190.93.240.0/20"
  "188.114.96.0/20"
  "197.234.240.0/22"
  "198.41.128.0/17"
  "162.158.0.0/15"
  "104.16.0.0/13"
  "104.24.0.0/14"
  "172.64.0.0/13"
  "131.0.72.0/22"
  "2400:cb00::/32"
  "2606:4700::/32"
  "2803:f800::/32"
  "2405:b500::/32"
  "2405:8100::/32"
  "2a06:98c0::/29"
  "2c0f:f248::/32"
)

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH administration"

for range in "${cloudflare_ranges[@]}"; do
  ufw allow proto tcp from "${range}" to any port 80 comment "Cloudflare HTTP"
  ufw allow proto tcp from "${range}" to any port 443 comment "Cloudflare HTTPS"
done

ufw --force enable
ufw status verbose
