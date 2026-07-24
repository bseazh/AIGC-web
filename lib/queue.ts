import { Queue } from "bullmq";

let generationQueue: Queue | undefined;
let moderationQueue: Queue | undefined;

function connection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is not configured");
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export function getGenerationQueue() {
  if (!generationQueue) {
    generationQueue = new Queue("generation", { connection: connection() });
  }
  return generationQueue;
}

export function automaticModerationEnabled() {
  return process.env.CONTENT_REVIEW_PROVIDER === "tencent-ci";
}

export function getModerationQueue() {
  if (!moderationQueue) moderationQueue = new Queue("moderation", { connection: connection() });
  return moderationQueue;
}

export async function enqueueContentReview(reviewId: string, assetId: string) {
  if (!automaticModerationEnabled()) return false;
  await getModerationQueue().add(
    "moderate-content",
    { reviewId, assetId },
    { jobId: reviewId, attempts: 4, backoff: { type: "exponential", delay: 15_000 }, removeOnComplete: 500, removeOnFail: 500 },
  );
  return true;
}
