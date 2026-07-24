#!/usr/bin/env bash
set -euo pipefail

health_url="http://127.0.0.1:3010/api/health/"
if ! response="$(curl --fail --silent --show-error --max-time 20 "$health_url")"; then
  /home/ubuntu/project/AIGC_web/scripts/send-alert-email.sh "[AIGC] Health check failed" "The production health endpoint failed at $(date -Is). URL: $health_url"
  exit 1
fi

if [[ "$response" != *'"status":"healthy"'* ]]; then
  /home/ubuntu/project/AIGC_web/scripts/send-alert-email.sh "[AIGC] Health check unhealthy" "The production health endpoint returned: $response"
  exit 1
fi
