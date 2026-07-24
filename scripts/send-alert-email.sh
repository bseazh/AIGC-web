#!/usr/bin/env bash
set -euo pipefail

alert_env="/home/ubuntu/.aigc-alert.env"
[[ -f "$alert_env" ]] || exit 0
source "$alert_env"
[[ -n "${ALERT_EMAIL_TO:-}" ]] || exit 0

subject="${1:-AIGC alert}"
body="${2:-No additional details available.}"
printf 'To: %s\nFrom: %s\nSubject: %s\nContent-Type: text/plain; charset=UTF-8\n\n%s\n' "$ALERT_EMAIL_TO" "${ALERT_EMAIL_FROM:-$ALERT_EMAIL_TO}" "$subject" "$body" | msmtp -t
