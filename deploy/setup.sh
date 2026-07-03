#!/usr/bin/env bash
# ============================================================
# Haxax — one-shot server setup for an Ubuntu VPS
# (built for Oracle Cloud "Always Free", works on any Ubuntu 22.04/24.04 box)
#
# Run from the repo root on the server:
#     bash deploy/setup.sh haxax.com
#
# It installs Node + Caddy, opens the firewall, builds Haxax, runs it as a
# systemd service (auto-restart, auto-start on boot), and puts Caddy in front
# for automatic HTTPS on your domain. Safe to re-run (idempotent).
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "usage: bash deploy/setup.sh <your-domain>    e.g.  bash deploy/setup.sh haxax.com"
  exit 1
fi
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(whoami)"
NPM_BIN=""

echo "==> Haxax setup for ${DOMAIN}"
echo "    repo: ${REPO_DIR}   user: ${USER_NAME}"

sudo apt-get update -y

# ---- 0) swap (helps the build on 1GB micro instances) ----
MEM_KB=$(awk '/MemTotal/{print $2}' /proc/meminfo)
if [ "${MEM_KB:-0}" -lt 2000000 ] && [ ! -f /swapfile ]; then
  echo "==> low RAM detected — adding 2G swap so the build doesn't OOM"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# ---- 1) Node 20 ----
if ! command -v node >/dev/null 2>&1; then
  echo "==> installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
NPM_BIN="$(command -v npm)"
echo "    node $(node -v)   npm $(npm -v)"

# ---- 2) Caddy (auto-HTTPS reverse proxy) ----
if ! command -v caddy >/dev/null 2>&1; then
  echo "==> installing Caddy"
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

# ---- 3) open the OS firewall for 80/443 ----
# Oracle's Ubuntu image ships iptables rules that block everything but SSH.
echo "==> opening ports 80/443 on the host firewall"
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  sudo ufw allow 80/tcp; sudo ufw allow 443/tcp
else
  sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 || true
  sudo netfilter-persistent save >/dev/null 2>&1 || true
fi

# ---- 4) .env (prompts for secrets on first run; kept out of git) ----
if [ ! -f "${REPO_DIR}/.env" ]; then
  echo "==> creating .env (press Enter to accept the default in brackets)"
  read -rsp "  Site gate password [haxax888]: " GATE;  echo; GATE=${GATE:-haxax888}
  read -rsp "  Admin password     [haig888]:  " ADMIN; echo; ADMIN=${ADMIN:-haig888}
  read -rsp "  Guest password     [haxax888]: " GUEST; echo; GUEST=${GUEST:-haxax888}
  read -rsp "  MiniMax API key (blank = skip AI notes): " MMKEY; echo
  SECRET="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  {
    echo "HAXAX_API_PORT=8787"
    echo "NODE_ENV=production"
    echo "HAXAX_GATE_PASSWORD=${GATE}"
    echo "HAXAX_ADMIN_PASSWORD=${ADMIN}"
    echo "HAXAX_GUEST_PASSWORD=${GUEST}"
    echo "HAXAX_SESSION_SECRET=${SECRET}"
    echo "MINIMAX_MODEL=MiniMax-M2"
    echo "MINIMAX_URL=https://api.minimax.io/v1/text/chatcompletion_v2"
    [ -n "${MMKEY}" ] && echo "MINIMAX_API_KEY=${MMKEY}"
  } > "${REPO_DIR}/.env"
  chmod 600 "${REPO_DIR}/.env"
else
  echo "==> .env already present — leaving it as is"
fi

# ---- 5) build ----
echo "==> npm install && npm run build"
cd "${REPO_DIR}"
npm install
npm run build

# ---- 6) systemd service (auto-restart + start on boot) ----
echo "==> installing systemd service 'haxax'"
sudo tee /etc/systemd/system/haxax.service >/dev/null <<EOF
[Unit]
Description=Haxax live data service
After=network.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${REPO_DIR}
Environment=NODE_ENV=production
ExecStart=${NPM_BIN} start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable haxax >/dev/null 2>&1 || true
sudo systemctl restart haxax

# ---- 7) Caddy reverse proxy for the domain ----
echo "==> configuring Caddy for ${DOMAIN} (+ www)"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
${DOMAIN}, www.${DOMAIN} {
    reverse_proxy 127.0.0.1:8787
}
EOF
sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy

PUBIP="$(curl -s --max-time 5 https://api.ipify.org || echo '<this server IP>')"
echo ""
echo "============================================================"
echo " Haxax is running behind Caddy on this server."
echo " Next: point your domain's DNS at this box, then open https://${DOMAIN}"
echo ""
echo "   A record   ${DOMAIN}       ->  ${PUBIP}"
echo "   A record   www.${DOMAIN}   ->  ${PUBIP}"
echo ""
echo " Check status:   sudo systemctl status haxax --no-pager"
echo " Live logs:      journalctl -u haxax -f"
echo "============================================================"
