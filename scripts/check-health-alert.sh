#!/usr/bin/env bash
set -euo pipefail
umask 077

project_dir="${AIGC_PROJECT_DIR:-/home/ubuntu/project/AIGC_web}"
health_url="${AIGC_HEALTH_URL:-http://127.0.0.1:3010/api/health/}"
alert_sender="${AIGC_ALERT_SENDER:-$project_dir/scripts/send-alert-email.sh}"
observability_script="${AIGC_OBSERVABILITY_SCRIPT:-$project_dir/scripts/observability-alerts.mjs}"
state_file="${AIGC_HEALTH_ALERT_STATE_FILE:-/home/ubuntu/.local/state/aigc-health-alert/state}"

if [[ -f "$project_dir/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$project_dir/.env.production"
  set +a
fi

repeat_seconds="${HEALTH_ALERT_REPEAT_SECONDS:-21600}"
if [[ ! "$repeat_seconds" =~ ^[0-9]+$ ]]; then
  echo "HEALTH_ALERT_REPEAT_SECONDS must be a non-negative integer" >&2
  exit 1
fi

previous_state="healthy"
previous_key="none"
previous_sent_at=0
if [[ -r "$state_file" ]]; then
  IFS=$'\t' read -r previous_state previous_key previous_sent_at < "$state_file" || true
fi
[[ "$previous_sent_at" =~ ^[0-9]+$ ]] || previous_sent_at=0

persist_state() {
  local state="$1" key="$2" sent_at="$3"
  local state_dir temporary
  state_dir="$(dirname "$state_file")"
  temporary="${state_file}.$$"
  mkdir -p "$state_dir"
  printf '%s\t%s\t%s\n' "$state" "$key" "$sent_at" > "$temporary"
  mv "$temporary" "$state_file"
}

send_failure_alert() {
  local key="$1" subject="$2" body="$3"
  local now sent_at
  now="$(date +%s)"
  sent_at="$previous_sent_at"
  if [[ "$previous_state" != "failed" || "$previous_key" != "$key" || $((now - previous_sent_at)) -ge "$repeat_seconds" ]]; then
    "$alert_sender" "$subject" "$body"
    sent_at="$now"
  fi
  persist_state "failed" "$key" "$sent_at"
}

mark_recovered() {
  if [[ "$previous_state" == "failed" ]]; then
    "$alert_sender" "[AIGC] Health recovered" "Production health checks recovered at $(date -Is). Previous incident: $previous_key"
  fi
  persist_state "healthy" "none" 0
}

body_file="$(mktemp)"
error_file="$(mktemp)"
trap 'rm -f "$body_file" "$error_file"' EXIT

set +e
http_code="$(curl --silent --show-error --output "$body_file" --write-out '%{http_code}' --max-time 20 "$health_url" 2>"$error_file")"
curl_status=$?
set -e
response="$(<"$body_file")"
curl_error="$(<"$error_file")"

if [[ "$curl_status" -ne 0 ]]; then
  send_failure_alert "health-transport-$curl_status" "[AIGC] Health check failed" \
    "The production health endpoint could not be reached at $(date -Is).
URL: $health_url
curl exit: $curl_status
error: ${curl_error:-unknown transport error}"
  exit 1
fi

health_summary="$(node - "$body_file" <<'NODE'
const { readFileSync } = require("node:fs");
try {
  const payload = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const down = Object.entries(payload.checks || {}).filter(([, value]) => value === "down").map(([name]) => name).sort();
  process.stdout.write(`${String(payload.status || "invalid")}\t${down.join(",") || "unknown"}`);
} catch {
  process.stdout.write("invalid\tunknown");
}
NODE
)"
IFS=$'\t' read -r health_status down_checks <<< "$health_summary"

if [[ "$http_code" != "200" || "$health_status" != "healthy" ]]; then
  subject="[AIGC] Health check unhealthy"
  [[ "$health_status" == "degraded" ]] && subject="[AIGC] Health degraded"
  send_failure_alert "health-$health_status-$http_code-$down_checks" "$subject" \
    "The production health endpoint reported $health_status at $(date -Is).
URL: $health_url
HTTP status: $http_code
Down checks: $down_checks
Response: ${response:0:8000}"
  exit 1
fi

set +e
observability="$(cd "$project_dir" && node "$observability_script" 2>&1)"
observability_status=$?
set -e
if [[ "$observability_status" -ne 0 ]]; then
  if [[ "$observability_status" -eq 2 ]]; then
    send_failure_alert "observability-alert" "[AIGC] Observability alert" "$observability"
  else
    send_failure_alert "observability-error-$observability_status" "[AIGC] Observability check failed" "$observability"
  fi
  exit "$observability_status"
fi

mark_recovered
