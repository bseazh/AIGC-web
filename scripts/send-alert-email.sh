#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/project/AIGC_web
set -a
source .env.production
alert_env="/home/ubuntu/.aigc-alert.env"
[[ ! -f "$alert_env" ]] || source "$alert_env"
set +a

subject="${1:-AIGC alert}"
body="${2:-No additional details available.}"
node scripts/send-alert-email.mjs "$subject" "$body"
