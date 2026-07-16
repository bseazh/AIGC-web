import { NextResponse } from "next/server";
import Redis from "ioredis";
import { db } from "@/lib/db";

export async function GET() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }

  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2_000 });
  try {
    await Promise.all([db.query("SELECT 1"), redis.connect().then(() => redis.ping())]);
    return NextResponse.json({ status: "healthy", database: "up", queue: "up" });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  } finally {
    redis.disconnect();
  }
}
