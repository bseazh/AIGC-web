import pg from "pg";
import { Queue } from "bullmq";

const required = ["DATABASE_URL", "REDIS_URL"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const redis = new URL(process.env.REDIS_URL);
const connection = { host: redis.hostname, port: Number(redis.port || 6379), password: redis.password || undefined, maxRetriesPerRequest: null };
const generation = new Queue("generation", { connection });
const moderation = new Queue("moderation", { connection });

async function loki5xx() {
  try {
    const query = 'sum(count_over_time({job="nginx"} | json | status >= 500 [5m]))';
    const response = await fetch(`http://127.0.0.1:3100/loki/api/v1/query?query=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(3000) });
    const body = await response.json();
    return Number(body?.data?.result?.[0]?.value?.[1] || 0);
  } catch { return null; }
}

try {
  const [events, tasks, refunds, heartbeats, generationWaiting, moderationWaiting, http5xx] = await Promise.all([
    pool.query("SELECT COUNT(*) FILTER (WHERE event_type='LOGIN_FAILED')::int AS login_failures FROM audit_events WHERE created_at > NOW()-INTERVAL '5 minutes'"),
    pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='FAILED')::int AS failed FROM generation_tasks WHERE created_at > NOW()-INTERVAL '15 minutes'"),
    pool.query("SELECT COUNT(*)::int AS abnormal FROM payment_refunds WHERE status IN ('ABNORMAL','FAILED') AND updated_at > NOW()-INTERVAL '15 minutes'"),
    pool.query("SELECT details_json->>'kind' AS kind, MAX(last_seen_at) AS last_seen_at FROM worker_heartbeats GROUP BY details_json->>'kind'"),
    generation.getWaitingCount(), moderation.getWaitingCount(), loki5xx(),
  ]);
  const total = Number(tasks.rows[0]?.total || 0); const failed = Number(tasks.rows[0]?.failed || 0);
  const failureRate = total ? failed / total : 0;
  const heartbeatMap = Object.fromEntries(heartbeats.rows.map((row) => [row.kind, row.last_seen_at]));
  const stale = ["generation", ...(process.env.CONTENT_REVIEW_PROVIDER === "tencent-ci" ? ["moderation"] : [])].filter((kind) => !heartbeatMap[kind] || Date.now() - new Date(heartbeatMap[kind]).getTime() > 90_000);
  const metrics = { http5xx, loginFailures: Number(events.rows[0]?.login_failures || 0), taskTotal15m: total, taskFailures15m: failed, taskFailureRate: failureRate, generationWaiting, moderationWaiting, abnormalRefunds15m: Number(refunds.rows[0]?.abnormal || 0), staleWorkers: stale };
  const alerts = [];
  if (http5xx !== null && http5xx >= Number(process.env.ALERT_HTTP_5XX_5M || 5)) alerts.push(`HTTP 5xx in 5m: ${http5xx}`);
  if (metrics.loginFailures >= Number(process.env.ALERT_LOGIN_FAILURES_5M || 20)) alerts.push(`Login failures in 5m: ${metrics.loginFailures}`);
  if (total >= 5 && failureRate >= Number(process.env.ALERT_TASK_FAILURE_RATE || 0.3)) alerts.push(`Task failure rate: ${(failureRate * 100).toFixed(1)}% (${failed}/${total})`);
  if (generationWaiting >= Number(process.env.ALERT_GENERATION_QUEUE_WAITING || 20) || moderationWaiting >= Number(process.env.ALERT_MODERATION_QUEUE_WAITING || 50)) alerts.push(`Queue backlog generation=${generationWaiting} moderation=${moderationWaiting}`);
  if (metrics.abnormalRefunds15m > 0) alerts.push(`Abnormal refunds in 15m: ${metrics.abnormalRefunds15m}`);
  if (stale.length) alerts.push(`Stale worker heartbeat: ${stale.join(",")}`);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: alerts.length ? "error" : "info", service: "aigc-observability", event: "alert_evaluation", metrics, alerts }));
  if (alerts.length) process.exitCode = 2;
} finally {
  await generation.close(); await moderation.close(); await pool.end();
}
