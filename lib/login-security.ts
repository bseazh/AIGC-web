import { createHash } from "node:crypto";
import { redis } from "@/lib/redis";

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function keys(identifier: string, ip: string) {
  return [`login-fail:identifier:${digest(identifier)}`, `login-fail:ip:${digest(ip)}`] as const;
}

export async function loginRateLimit(identifier: string, ip: string) {
  const attemptKeys = keys(identifier, ip);
  const [counts, ttls] = await Promise.all([redis.mget(...attemptKeys), Promise.all(attemptKeys.map((key) => redis.ttl(key)))]);
  const limited = counts.some((count) => Number(count || 0) >= MAX_FAILURES);
  return { limited, retryAfter: Math.max(1, ...ttls) };
}

export async function recordLoginFailure(identifier: string, ip: string) {
  for (const key of keys(identifier, ip)) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
  }
}

export async function clearIdentifierFailures(identifier: string) {
  await redis.del(keys(identifier, "unused")[0]);
}
