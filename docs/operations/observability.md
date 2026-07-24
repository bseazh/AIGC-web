# Production observability

## Components

- Nginx emits JSON access logs with `requestId`, status, duration, path, IP and user agent.
- Web, generation worker and moderation worker emit JSON to journald.
- Promtail ships the three systemd units and AIGC Nginx logs to Loki.
- Loki retains logs for 30 days (`720h`).
- Grafana listens only on `127.0.0.1:3001`; it is not exposed to the public network.
- PostgreSQL remains the source of truth for audit, provider, wallet and task events.

## Secure Grafana access

Use an SSH tunnel from an authorized workstation:

```bash
ssh -L 3001:127.0.0.1:3001 ubuntu@production-host
```

Open `http://127.0.0.1:3001`. The `admin` password is stored only in the production `.env.production` file as `GRAFANA_ADMIN_PASSWORD`.

## Useful Loki queries

```logql
{job="nginx"} | json | status >= 500
{unit="aigc-web.service"} | json | level="error"
{unit="aigc-worker.service"} | json | taskId="TASK_ID"
{unit="aigc-moderation-worker.service"} | json | level="error"
```

## Alerts

The five-minute health timer evaluates:

- 5 or more HTTP 5xx responses in five minutes;
- 20 or more failed logins in five minutes;
- task failure rate at or above 30% with at least five tasks;
- generation queue at 20 or moderation queue at 50 waiting jobs;
- any abnormal or failed refund in 15 minutes;
- generation or moderation heartbeat older than 90 seconds.

Thresholds are configurable through the `ALERT_*` production variables. Alerts use the existing `/home/ubuntu/.aigc-alert.env` email channel.

## Registration rollout

`PUBLIC_REGISTRATION_ROLLOUT_PERCENT=10` deterministically opens registration to 10% of email cohorts. Existing accounts remain unaffected. Keep the rollout at 10% for 3–7 days, then review HTTP 5xx, task failure rate, queue age, moderation SLA, refunds and support volume before increasing to 25%, 50%, and 100%.
