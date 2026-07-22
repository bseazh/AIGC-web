import { NextResponse } from "next/server";
import Redis from "ioredis";
import { db } from "@/lib/db";
import { getGenerationQueue } from "@/lib/queue";
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
    const [database, redisCheck, queue, worker, cos, ark] = await Promise.all([
      check("database", () => db.query("SELECT 1")),
      check("redis", () => redis.connect().then(() => redis.ping())),
      check("queue", async () => ({ waiting: await getGenerationQueue().getWaitingCount(), active: await getGenerationQueue().getActiveCount() })),
      check("worker", async () => {
        const result = await db.query<{ last_seen_at: string }>("SELECT last_seen_at FROM worker_heartbeats WHERE last_seen_at > NOW() - INTERVAL '90 seconds' ORDER BY last_seen_at DESC LIMIT 1");
        if (!result.rows[0]) throw new Error("worker heartbeat is stale");
        return result.rows[0];
      }),
      check("cos", checkCos),
      check("ark", checkArk),
    ]);
    const checks = Object.fromEntries([database, redisCheck, queue, worker, cos, ark].map(({ name, status }) => [name, status]));
    const healthy = Object.values(checks).every((status) => status === "up");
    return NextResponse.json({ status: healthy ? "healthy" : "unhealthy", checks, queue: queue.value, workerLastSeenAt: (worker.value as { last_seen_at?: string } | null)?.last_seen_at || null }, { status: healthy ? 200 : 503 });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  } finally {
    redis.disconnect();
  }
}
