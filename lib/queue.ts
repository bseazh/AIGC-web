import { Queue } from "bullmq";

let generationQueue: Queue | undefined;

export function getGenerationQueue() {
  if (!generationQueue) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error("REDIS_URL is not configured");
    const url = new URL(redisUrl);
    generationQueue = new Queue("generation", {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
        maxRetriesPerRequest: null,
      },
    });
  }
  return generationQueue;
}
