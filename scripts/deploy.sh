#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/project/AIGC_web

if [[ -f .env.production ]]; then
  set -a
  source .env.production
  set +a
fi

# Automatic moderation reuses the existing COS credentials. Bootstrap only the
# non-provider secret so an older production environment can adopt the worker
# without placing generated secrets in source control.
if [[ -f .env.production && -z "${CONTENT_REVIEW_PROVIDER:-}" ]]; then
  printf '%s\n' 'CONTENT_REVIEW_PROVIDER=tencent-ci' >> .env.production
  export CONTENT_REVIEW_PROVIDER=tencent-ci
fi
if [[ -f .env.production && -z "${PUBLIC_APP_URL:-}" ]]; then
  printf '%s\n' 'PUBLIC_APP_URL=https://aigc.bigapple.store' >> .env.production
  export PUBLIC_APP_URL=https://aigc.bigapple.store
fi
if [[ -f .env.production && "${CONTENT_REVIEW_PROVIDER:-}" == "tencent-ci" && -z "${CONTENT_REVIEW_INTERNAL_SECRET:-}" ]]; then
  CONTENT_REVIEW_INTERNAL_SECRET="$(openssl rand -hex 32)"
  printf 'CONTENT_REVIEW_INTERNAL_SECRET=%s\n' "$CONTENT_REVIEW_INTERNAL_SECRET" >> .env.production
  export CONTENT_REVIEW_INTERNAL_SECRET
  chmod 600 .env.production
fi

./scripts/infra.sh

npm ci --include=dev --no-audit --no-fund
npm run test:regression
npm run typecheck
env -u TURBOPACK -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN npm run build
node scripts/migrate.mjs
npm run test:db
npm run verify:production

chmod 700 scripts/backup-postgres.sh scripts/verify-postgres-backup.sh scripts/send-alert-email.sh scripts/check-health-alert.sh
sudo install -D -m 644 deploy/aigc-storage-cleanup.service /etc/systemd/system/aigc-storage-cleanup.service
sudo install -D -m 644 deploy/aigc-storage-cleanup.timer /etc/systemd/system/aigc-storage-cleanup.timer
sudo install -D -m 644 deploy/aigc-lifecycle-maintenance.service /etc/systemd/system/aigc-lifecycle-maintenance.service
sudo install -D -m 644 deploy/aigc-lifecycle-maintenance.timer /etc/systemd/system/aigc-lifecycle-maintenance.timer
sudo install -D -m 644 deploy/aigc-postgres-backup.service /etc/systemd/system/aigc-postgres-backup.service
sudo install -D -m 644 deploy/aigc-postgres-backup.timer /etc/systemd/system/aigc-postgres-backup.timer
sudo install -D -m 644 deploy/aigc-postgres-restore-verify.service /etc/systemd/system/aigc-postgres-restore-verify.service
sudo install -D -m 644 deploy/aigc-postgres-restore-verify.timer /etc/systemd/system/aigc-postgres-restore-verify.timer
sudo install -D -m 644 deploy/aigc-health-alert.service /etc/systemd/system/aigc-health-alert.service
sudo install -D -m 644 deploy/aigc-health-alert.timer /etc/systemd/system/aigc-health-alert.timer
sudo install -D -m 644 deploy/aigc-moderation-worker.service /etc/systemd/system/aigc-moderation-worker.service
sudo install -D -m 644 deploy/aigc-wechat-reconcile.service /etc/systemd/system/aigc-wechat-reconcile.service
sudo install -D -m 644 deploy/aigc-wechat-reconcile.timer /etc/systemd/system/aigc-wechat-reconcile.timer
sudo install -D -m 644 deploy/aigc-alert@.service /etc/systemd/system/aigc-alert@.service
sudo install -D -m 644 deploy/journald-aigc.conf /etc/systemd/journald.conf.d/10-aigc.conf
sudo install -D -m 644 deploy/sshd-aigc-hardening.conf /etc/ssh/sshd_config.d/01-aigc-hardening.conf
sudo rm -f /etc/ssh/sshd_config.d/99-aigc-hardening.conf
sudo sshd -t
sudo systemctl daemon-reload
sudo systemctl enable --now aigc-storage-cleanup.timer aigc-lifecycle-maintenance.timer aigc-postgres-backup.timer aigc-postgres-restore-verify.timer aigc-health-alert.timer
if [[ "${WECHAT_PAY_ENABLED:-false}" == "true" ]]; then
  sudo systemctl enable --now aigc-wechat-reconcile.timer
else
  sudo systemctl disable --now aigc-wechat-reconcile.timer 2>/dev/null || true
fi
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
if [[ "${CONTENT_REVIEW_PROVIDER:-}" == "tencent-ci" ]]; then
  sudo systemctl enable --now aigc-moderation-worker
  sudo systemctl restart aigc-moderation-worker
else
  sudo systemctl disable --now aigc-moderation-worker 2>/dev/null || true
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
