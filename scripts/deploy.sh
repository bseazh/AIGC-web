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

chmod 700 scripts/backup-postgres.sh scripts/verify-postgres-backup.sh scripts/send-alert-email.sh scripts/check-health-alert.sh
sudo install -D -m 644 deploy/aigc-storage-cleanup.service /etc/systemd/system/aigc-storage-cleanup.service
sudo install -D -m 644 deploy/aigc-storage-cleanup.timer /etc/systemd/system/aigc-storage-cleanup.timer
sudo install -D -m 644 deploy/aigc-postgres-backup.service /etc/systemd/system/aigc-postgres-backup.service
sudo install -D -m 644 deploy/aigc-postgres-backup.timer /etc/systemd/system/aigc-postgres-backup.timer
sudo install -D -m 644 deploy/aigc-postgres-restore-verify.service /etc/systemd/system/aigc-postgres-restore-verify.service
sudo install -D -m 644 deploy/aigc-postgres-restore-verify.timer /etc/systemd/system/aigc-postgres-restore-verify.timer
sudo install -D -m 644 deploy/aigc-health-alert.service /etc/systemd/system/aigc-health-alert.service
sudo install -D -m 644 deploy/aigc-health-alert.timer /etc/systemd/system/aigc-health-alert.timer
sudo install -D -m 644 deploy/aigc-alert@.service /etc/systemd/system/aigc-alert@.service
sudo install -D -m 644 deploy/journald-aigc.conf /etc/systemd/journald.conf.d/10-aigc.conf
sudo install -D -m 644 deploy/sshd-aigc-hardening.conf /etc/ssh/sshd_config.d/01-aigc-hardening.conf
sudo rm -f /etc/ssh/sshd_config.d/99-aigc-hardening.conf
sudo sshd -t
sudo systemctl daemon-reload
sudo systemctl enable --now aigc-storage-cleanup.timer aigc-postgres-backup.timer aigc-postgres-restore-verify.timer aigc-health-alert.timer
sudo systemctl restart systemd-journald
sudo systemctl reload ssh

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
