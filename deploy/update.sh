#!/usr/bin/env bash
# Pull the latest code, rebuild, and restart Haxax. Run on the server:
#     bash deploy/update.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_DIR}"
echo "==> git pull"
git pull --ff-only
echo "==> npm install && build"
npm install
npm run build
echo "==> restart"
sudo systemctl restart haxax
sleep 2
sudo systemctl status haxax --no-pager | head -6
echo "==> done"
