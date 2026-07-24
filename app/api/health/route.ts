import { NextResponse } from "next/server";
import Redis from "ioredis";
import { db } from "@/lib/db";
import { automaticModerationEnabled, getGenerationQueue, getModerationQueue } from "@/lib/queue";
import { getCosClient } from "@/lib/cos";

function checkCos() {
  if (!process.env.COS_BUCKET || !process.env.COS_REGION) throw new Error("COS is not configured");
  return new Promise<void>((resolve, reject) => getCosClient().headBucket({ Bucket: process.env.COS_BUCKET!, Region: process.env.COS_REGION! }, (error) => error ? reject(error) : resolve()));
}

async function checkArk() {
  if (!process.env.ARK_API_KEY) throw new Error("Ark is not configured");
  const arkModel = process.env.ARK_MODEL || "doubao-seedance-2-0-260128";
  const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/models", { headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}` }, signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error(`Ark HTTP ${response.status}`);
  const payload = await response.json().catch(() => null);
  const models = Array.isArray(payload?.data) ? payload.data.map((model: { id?: string }) => model.id) : [];
  if (models.length && !models.includes(arkModel)) throw new Error(`Ark model is not enabled: ${arkModel}`);
}

export async function GET() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return NextResponse.json({ status: "unhealthy", checks: { redis: "down", queue: "down", worker: "unknown", ark: "unknown", cos: "unknown" } }, { status: 503 });
  }

  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2_000 });
  try {
    const check = async (name: string, action: () => Promise<unknown>) => {
      try { return { name, status: "up" as const, value: await action() }; }
      catch (error) { console.error(`health check ${name} failed`, error); return { name, status: "down" as const, value: null }; }
    };
    const reviewMaxAgeHours = Number(process.env.REVIEW_BACKLOG_MAX_AGE_HOURS || 24);
    const reviewMaxCount = Number(process.env.REVIEW_BACKLOG_MAX_COUNT || 1000);
    const deletionCoolingDays = Number(process.env.ACCOUNT_DELETION_COOLING_DAYS || 7);
    const reviewSlaMinutes = Number(process.env.REVIEW_SLA_TARGET_MINUTES || 30);
    const reviewAutoErrorMax = Number(process.env.REVIEW_AUTO_ERROR_MAX_24H || 20);
    const [database, redisCheck, queue, worker, moderationWorker, moderation, notifications, lifecycle, reconciliation, cos, ark] = await Promise.all([
      check("database", () => db.query("SELECT 1")),
      check("redis", () => redis.connect().then(() => redis.ping())),
      check("queue", async () => ({ waiting: await getGenerationQueue().getWaitingCount(), active: await getGenerationQueue().getActiveCount() })),
      check("worker", async () => {
        const result = await db.query<{ last_seen_at: string }>("SELECT last_seen_at FROM worker_heartbeats WHERE details_json->>'kind' = 'generation' AND last_seen_at > NOW() - INTERVAL '90 seconds' ORDER BY last_seen_at DESC LIMIT 1");
        if (!result.rows[0]) throw new Error("worker heartbeat is stale");
        return result.rows[0];
      }),
      check("moderationWorker", async () => {
        if (!automaticModerationEnabled()) return { enabled: false };
        const [heartbeat, waiting, active] = await Promise.all([
          db.query<{ last_seen_at: string }>("SELECT last_seen_at FROM worker_heartbeats WHERE details_json->>'kind' = 'moderation' AND last_seen_at > NOW() - INTERVAL '90 seconds' ORDER BY last_seen_at DESC LIMIT 1"),
          getModerationQueue().getWaitingCount(), getModerationQueue().getActiveCount(),
        ]);
        if (!heartbeat.rows[0]) throw new Error("moderation worker heartbeat is stale");
        return { enabled: true, lastSeenAt: heartbeat.rows[0].last_seen_at, waiting, active };
      }),
      check("moderation", async () => {
        const result = await db.query<{ count: string; oldest_at: string | null; oldest_age_seconds: string; provider_errors: string }>(
          `SELECT COUNT(*)::text AS count, MIN(created_at)::text AS oldest_at,
                  COALESCE(EXTRACT(EPOCH FROM NOW() - MIN(created_at)), 0)::text AS oldest_age_seconds,
                  (SELECT COUNT(*)::text FROM content_review_records WHERE updated_at >= NOW() - INTERVAL '24 hours' AND metadata_json ? 'providerError') AS provider_errors
           FROM content_review_records WHERE status IN ('PENDING', 'NEEDS_MANUAL')`,
        );
        const value = result.rows[0];
        const count = Number(value?.count || 0); const oldestAgeSeconds = Number(value?.oldest_age_seconds || 0); const providerErrors = Number(value?.provider_errors || 0);
        if (count > reviewMaxCount || oldestAgeSeconds > reviewMaxAgeHours * 3600 || oldestAgeSeconds > reviewSlaMinutes * 60 || providerErrors > reviewAutoErrorMax) throw new Error(`moderation backlog count=${count} oldestAgeSeconds=${oldestAgeSeconds} providerErrors=${providerErrors}`);
        return { count, oldestAt: value?.oldest_at || null, providerErrors, slaMinutes: reviewSlaMinutes };
      }),
      check("notifications", async () => {
        const result = await db.query<{ exhausted: string; stuck: string }>(
          `SELECT COUNT(*) FILTER (WHERE status = 'FAILED' AND attempts >= 5)::text AS exhausted,
                  COUNT(*) FILTER (WHERE status = 'SENDING' AND updated_at < NOW() - INTERVAL '5 minutes')::text AS stuck
           FROM notification_outbox`,
        );
        const exhausted = Number(result.rows[0]?.exhausted || 0); const stuck = Number(result.rows[0]?.stuck || 0);
        if (exhausted || stuck) throw new Error(`notification backlog exhausted=${exhausted} stuck=${stuck}`);
        return { exhausted, stuck };
      }),
      check("lifecycle", async () => {
        const [latest, overdue] = await Promise.all([
          db.query<{ status: string; created_at: string }>("SELECT status, created_at FROM operations_runs WHERE operation = 'LIFECYCLE_MAINTENANCE' ORDER BY created_at DESC LIMIT 1"),
          db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users WHERE status = 'DELETION_PENDING' AND deletion_requested_at < NOW() - ($1 * INTERVAL '1 day') - INTERVAL '2 hours'", [deletionCoolingDays]),
        ]);
        const overdueAccounts = Number(overdue.rows[0]?.count || 0); const lastRun = latest.rows[0] || null;
        if (lastRun?.status === "FAILED" || overdueAccounts > 0) throw new Error(`lifecycle lastStatus=${lastRun?.status || "none"} overdueAccounts=${overdueAccounts}`);
        return { lastRunAt: lastRun?.created_at || null, overdueAccounts };
      }),
      check("reconciliation", async () => {
        const result = await db.query<{ status: string; created_at: string; unresolved: string }>(
          `SELECT r.status, r.created_at,
                  (SELECT COUNT(*)::text FROM payment_reconciliation_items WHERE resolved_at IS NULL) AS unresolved
           FROM payment_reconciliation_runs r ORDER BY r.created_at DESC LIMIT 1`,
        ).catch((error: unknown) => {
          if (error instanceof Error && /payment_reconciliation/.test(error.message)) return { rows: [] as Array<{ status: string; created_at: string; unresolved: string }> };
          throw error;
        });
        const latest = result.rows[0]; const unresolved = Number(latest?.unresolved || 0);
        if (latest?.status === "FAILED" || unresolved > Number(process.env.WECHAT_RECONCILIATION_MAX_UNRESOLVED || 0)) throw new Error(`payment reconciliation status=${latest?.status || "none"} unresolved=${unresolved}`);
        return { lastRunAt: latest?.created_at || null, unresolved };
      }),
      check("cos", checkCos),
      check("ark", checkArk),
    ]);
    const checks = Object.fromEntries([database, redisCheck, queue, worker, moderationWorker, moderation, notifications, lifecycle, reconciliation, cos, ark].map(({ name, status }) => [name, status]));
    const healthy = Object.values(checks).every((status) => status === "up");
    return NextResponse.json({ status: healthy ? "healthy" : "unhealthy", checks, queue: queue.value, moderationWorker: moderationWorker.value, moderation: moderation.value, notifications: notifications.value, lifecycle: lifecycle.value, reconciliation: reconciliation.value, workerLastSeenAt: (worker.value as { last_seen_at?: string } | null)?.last_seen_at || null }, { status: healthy ? 200 : 503 });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  } finally {
    redis.disconnect();
  }
}
