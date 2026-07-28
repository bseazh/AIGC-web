#!/usr/bin/env bash
set -euo pipefail

version="${YT_DLP_VERSION:-latest}"
venv="${YT_DLP_VENV:-/home/ubuntu/.local/opt/aigc-yt-dlp}"
if [[ -x "$venv/bin/yt-dlp" && "${YT_DLP_FORCE_UPDATE:-false}" != "true" ]] &&
  "$venv/bin/python" -c 'import curl_cffi' 2>/dev/null; then
  sudo ln -sfn "$venv/bin/yt-dlp" /usr/local/bin/yt-dlp
  /usr/local/bin/yt-dlp --version
  /usr/bin/ffprobe -version | head -1
  exit 0
fi

python3 -m venv "$venv"
if [[ "$version" == "latest" ]]; then
  package='yt-dlp[default,curl-cffi]'
else
  package="yt-dlp[default,curl-cffi]==${version}"
fi
"$venv/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-input \
  --upgrade \
  "$package"
"$venv/bin/python" -c 'import curl_cffi'
sudo ln -sfn "$venv/bin/yt-dlp" /usr/local/bin/yt-dlp
/usr/local/bin/yt-dlp --version
/usr/bin/ffprobe -version | head -1
