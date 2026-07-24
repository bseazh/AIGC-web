import { readFile } from "node:fs/promises";

const checks = [
  ["upload review gate", "app/api/uploads/confirm/route.ts", "audit_status = 'PENDING_REVIEW'"],
  ["worker output review gate", "scripts/worker.mjs", "'PENDING_REVIEW'"],
  ["download READY gate", "app/api/assets/[id]/download/route.ts", "audit_status = 'READY'"],
  ["task list avoids pending output URL", "app/api/tasks/list/route.ts", "task.status === \"SUCCEEDED\""],
  ["content rejection refund", "app/api/admin/reviews/[id]/route.ts", "CONTENT_REJECTED"],
  ["server-side revocable sessions", "lib/session.ts", "login_sessions"],
  ["login failure limit", "app/api/auth/login/route.ts", "LOGIN_RATE_LIMITED"],
  ["task cancellation refund", "app/api/tasks/[id]/cancel/route.ts", "USER_CANCELED"],
  ["lifecycle review timeout", "scripts/lifecycle-maintenance.mjs", "OUTPUT_REVIEW_TIMEOUT"],
  ["account deletion finalization", "scripts/lifecycle-maintenance.mjs", "ACCOUNT_DELETION_FINALIZED"],
  ["WeChat Native accepts code_url without prepay_id", "lib/wechat-pay.ts", "if (!response.ok || !payload?.code_url)"],
  ["administrator login redirect", "app/api/auth/login/route.ts", "administrator ? \"/admin\" : \"/workspace\""],
  ["recharge code transaction lock", "app/api/recharge-codes/redeem/route.ts", "FOR UPDATE"],
  ["recharge code idempotent ledger", "app/api/recharge-codes/redeem/route.ts", "recharge-code:${code.id}:${user.id}"],
  ["production acceptance account bootstrap", "scripts/deploy.sh", "configure-production-acceptance.mjs"],
  ["production recharge code acceptance", "scripts/ark-video-acceptance.mjs", "duplicate denial and disable"],
  ["structured task logging", "scripts/worker.mjs", "task_started"],
  ["request correlation", "lib/task-creation.ts", "request_id"],
  ["systemd web failure alert", "deploy/aigc-web.service", "OnFailure=aigc-alert@%n.service"],
  ["central log retention", "deploy/observability/loki-config.yml", "retention_period: 720h"],
  ["registration rollout", "app/api/auth/register/route.ts", "PUBLIC_REGISTRATION_ROLLOUT_PERCENT"],
  ["runtime Loki verification", "scripts/verify-observability.mjs", "Nginx request log was not found in Loki"],
  ["SMTP alert fallback", "scripts/send-alert-email.mjs", "ALERT_EMAIL_TO || user"],
  ["daily rollout report guard", "scripts/gray-rollout-report.mjs", "ELIGIBLE_FOR_25_PERCENT"],
  ["rollout report reads configured traffic", "scripts/gray-rollout-report.mjs", "PUBLIC_REGISTRATION_ROLLOUT_PERCENT || 10"],
];

let failed = false;
for (const [name, path, expected] of checks) {
  const source = await readFile(path, "utf8");
  const ok = source.includes(expected);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exitCode = 1;
