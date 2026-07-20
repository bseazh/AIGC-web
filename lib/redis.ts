import Redis from "ioredis";

declare global {
  var __balaRedis: Redis | undefined;
}

function createRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is not configured");
  return new Redis(redisUrl, { maxRetriesPerRequest: 2 });
}

export const redis = global.__balaRedis ?? createRedis();

if (process.env.NODE_ENV !== "production") {
  global.__balaRedis = redis;
}
