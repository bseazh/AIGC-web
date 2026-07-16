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
npm run build
node scripts/migrate.mjs

mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static
if [[ -d public ]]; then
  cp -R public .next/standalone/public
fi

sudo systemctl restart aigc-web

for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3010/api/health/ >/dev/null; then
    echo "AIGC Web deployment is healthy"
    exit 0
  fi
  sleep 1
done

sudo journalctl -u aigc-web --no-pager -n 80
exit 1
