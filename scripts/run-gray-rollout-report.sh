#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/project/AIGC_web
set -a
source .env.production
set +a
report="$(node scripts/gray-rollout-report.mjs)"
node scripts/send-alert-email.mjs "[AIGC] Daily 10% rollout report" "$report"
find rollout-reports -type f -name 'rollout-*.json' -mtime +90 -delete
