#!/usr/bin/env bash
set -euo pipefail

profile="${DOUYIN_BROWSER_PROFILE:-/home/ubuntu/.cache/aigc-douyin-profile}"
browser="${DOUYIN_CHROMIUM_PATH:-}"
if [[ -z "$browser" ]]; then
  browser="$(find /home/ubuntu/.cache/ms-playwright -type f -path '*/chrome-linux64/chrome' 2>/dev/null | sort -V | tail -1)"
fi
if [[ -z "$browser" || ! -x "$browser" ]]; then
  echo "Chromium for Douyin cookie refresh was not found" >&2
  exit 1
fi

install -d -m 700 "$profile"
status=0
timeout --kill-after=5 25 "$browser" \
  --headless=new \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --user-data-dir="$profile" \
  --dump-dom \
  https://www.douyin.com/ >/dev/null 2>&1 || status=$?
if [[ "$status" -ne 0 && "$status" -ne 124 ]]; then
  echo "Headless Chromium could not initialize the Douyin profile (status $status)" >&2
  exit 1
fi
if [[ ! -s "$profile/Default/Cookies" ]]; then
  echo "Douyin browser profile did not produce a cookie database" >&2
  exit 1
fi
chmod -R go-rwx "$profile"
echo "Douyin headless browser profile is initialized"
