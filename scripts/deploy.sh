#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/project/AIGC_web

if [[ -f .env.production ]]; then
  set -a
  source .env.production
  set +a
fi

./scripts/infra.sh

npm ci --include=dev --no-audit --no-fund
npm run typecheck
env -u TURBOPACK -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN npm run build
node scripts/migrate.mjs
npm run verify:production

mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static
if [[ -d public ]]; then
  cp -R public .next/standalone/public
fi

sudo systemctl restart aigc-web
if systemctl list-unit-files aigc-worker.service >/dev/null 2>&1; then
  sudo systemctl restart aigc-worker
fi

for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3010/api/health/ >/dev/null; then
    echo "AIGC Web deployment is healthy"
    exit 0
  fi
  sleep 1
done

sudo journalctl -u aigc-web --no-pager -n 80
exit 1
