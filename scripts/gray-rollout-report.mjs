import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { Queue } from "bullmq";

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error("DATABASE_URL and REDIS_URL are required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const redis = new URL(process.env.REDIS_URL);
const connection = { host: redis.hostname, port: Number(redis.port || 6379), password: redis.password || undefined, maxRetriesPerRequest: null };
const generation = new Queue("generation", { connection }); const moderation = new Queue("moderation", { connection });

async function lokiCount(query) {
  const response = await fetch(`http://127.0.0.1:3100/loki/api/v1/query?query=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5_000) });
  const body = await response.json();
  return Number(body?.data?.result?.[0]?.value?.[1] || 0);
}

try {
  const [taskStats, reviewStats, refundStats, complaintStats, realUsers, rollout, generationWaiting, generationActive, moderationWaiting, httpTotal, http5xx] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='SUCCEEDED')::int AS succeeded, COUNT(*) FILTER (WHERE status='FAILED')::int AS failed, COUNT(*) FILTER (WHERE status='REJECTED')::int AS rejected, COALESCE(AVG(EXTRACT(EPOCH FROM updated_at-created_at)) FILTER (WHERE status='SUCCEEDED'),0)::float AS avg_seconds FROM generation_tasks WHERE created_at>NOW()-INTERVAL '24 hours'`),
    pool.query(`SELECT COUNT(*)::int AS reviewed, COALESCE(AVG(EXTRACT(EPOCH FROM reviewed_at-created_at)) FILTER (WHERE reviewed_at IS NOT NULL),0)::float AS avg_seconds, COUNT(*) FILTER (WHERE status IN ('PENDING','NEEDS_MANUAL') AND created_at<NOW()-INTERVAL '30 minutes')::int AS overdue FROM content_review_records WHERE created_at>NOW()-INTERVAL '24 hours'`),
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('ABNORMAL','FAILED'))::int AS abnormal FROM payment_refunds WHERE created_at>NOW()-INTERVAL '24 hours'`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE created_at>NOW()-INTERVAL '24 hours')::int AS created, COUNT(*) FILTER (WHERE status IN ('SUBMITTED','IN_PROGRESS','WAITING_USER'))::int AS open FROM complaints`),
    pool.query(`SELECT COUNT(DISTINCT u.id) FILTER (WHERE u.created_at>NOW()-INTERVAL '24 hours')::int AS registered, COUNT(DISTINCT t.user_id)::int AS active_task_users, COUNT(t.id)::int AS tasks, COUNT(t.id) FILTER (WHERE t.status='SUCCEEDED')::int AS succeeded_tasks, COALESCE(SUM(t.points) FILTER (WHERE t.status='SUCCEEDED'),0)::int AS consumed_points FROM users u LEFT JOIN generation_tasks t ON t.user_id=u.id AND t.created_at>NOW()-INTERVAL '24 hours' WHERE u.email IS DISTINCT FROM $1 AND u.email IS DISTINCT FROM $2`, [process.env.ACCEPTANCE_USER_EMAIL || "", process.env.ACCEPTANCE_ADMIN_EMAIL || ""]),
    pool.query(`SELECT MIN(created_at) AS started_at FROM operations_runs WHERE operation='REGISTRATION_ROLLOUT_STARTED'`),
    generation.getWaitingCount(), generation.getActiveCount(), moderation.getWaitingCount(),
    lokiCount('sum(count_over_time({job="nginx"}[24h]))'), lokiCount('sum(count_over_time({job="nginx"} | json | status >= 500 [24h]))'),
  ]);
  const tasks = taskStats.rows[0]; const reviews = reviewStats.rows[0]; const refunds = refundStats.rows[0]; const complaints = complaintStats.rows[0]; const users = realUsers.rows[0];
  const terminal = Number(tasks.succeeded) + Number(tasks.failed) + Number(tasks.rejected);
  const successRate = terminal ? Number(tasks.succeeded) / terminal : null; const http5xxRate = httpTotal ? http5xx / httpTotal : 0;
  const startedAt = rollout.rows[0]?.started_at || new Date().toISOString(); const observationHours = (Date.now() - new Date(startedAt).getTime()) / 3_600_000;
  const blockers = [];
  if (http5xxRate >= 0.005) blockers.push("HTTP_5XX_RATE");
  if (successRate !== null && successRate < 0.95) blockers.push("TASK_SUCCESS_RATE");
  if (generationWaiting >= 20 || moderationWaiting >= 50) blockers.push("QUEUE_BACKLOG");
  if (Number(reviews.overdue) > 0) blockers.push("REVIEW_SLA");
  if (Number(refunds.abnormal) > 0) blockers.push("ABNORMAL_REFUND");
  const decision = blockers.length ? "HOLD" : observationHours < 72 ? "OBSERVE" : "ELIGIBLE_FOR_25_PERCENT";
  const report = { status: "PASSED", generatedAt: new Date().toISOString(), rollout: { percent: Number(process.env.PUBLIC_REGISTRATION_ROLLOUT_PERCENT || 10), startedAt, observationHours: Number(observationHours.toFixed(1)), decision, blockers }, metrics24h: { http: { total: httpTotal, serverErrors: http5xx, serverErrorRate: http5xxRate }, tasks: { ...tasks, successRate }, queues: { generationWaiting, generationActive, moderationWaiting }, reviews, refunds, complaints, realUsers: users } };
  const directory = resolve(process.env.ROLLOUT_REPORT_DIR || "rollout-reports"); await mkdir(directory, { recursive: true });
  const dated = resolve(directory, `rollout-${new Date().toISOString().slice(0,10)}.json`); const latest = resolve(directory, "latest-rollout-report.json");
  await writeFile(dated, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); await writeFile(latest, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await pool.query("INSERT INTO operations_runs (operation,status,summary) VALUES ('GRAY_ROLLOUT_DAILY_REPORT','SUCCEEDED',$1)", [JSON.stringify({ decision, blockers, http5xxRate, successRate, realUsers: users, report: dated }).slice(0, 2000)]);
  console.log(JSON.stringify(report));
} finally { await generation.close(); await moderation.close(); await pool.end(); }
