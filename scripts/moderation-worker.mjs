import { createHmac } from "node:crypto";
import { Worker } from "bullmq";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";
import { installStructuredConsole, log } from "./structured-logger.mjs";

installStructuredConsole("aigc-moderation-worker");

const { Pool } = pg;
const required = ["DATABASE_URL", "REDIS_URL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY", "PUBLIC_APP_URL", "CONTENT_REVIEW_INTERNAL_SECRET"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
if (process.env.CONTENT_REVIEW_INTERNAL_SECRET.length < 32) throw new Error("CONTENT_REVIEW_INTERNAL_SECRET must be at least 32 characters");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const redisUrl = new URL(process.env.REDIS_URL);
const workerId = `${process.env.HOSTNAME || "moderation"}:moderation:${process.pid}`;
const detectTypes = (process.env.CONTENT_REVIEW_DETECT_TYPES || "Porn,Ads,Illegal,Abuse").split(",").map((value) => value.trim()).filter(Boolean);
const manualScore = Number(process.env.CONTENT_REVIEW_MANUAL_SCORE || 70);
const rejectScore = Number(process.env.CONTENT_REVIEW_REJECT_SCORE || 90);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function heartbeat() {
  await pool.query(
    "INSERT INTO worker_heartbeats (worker_id, last_seen_at, details_json) VALUES ($1, NOW(), $2::jsonb) ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, details_json = EXCLUDED.details_json",
    [workerId, JSON.stringify({ kind: "moderation", provider: "tencent-ci", pid: process.pid, concurrency: 2 })],
  );
}

function request(params) {
  return cos.request({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, ...params });
}

function xmlValues(xml, tag) {
  return [...String(xml || "").matchAll(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, "gis"))].map((match) => match[1].trim());
}

function collect(value, key, output = []) {
  if (!value || typeof value !== "object") return output;
  for (const [name, child] of Object.entries(value)) {
    if (name.toLowerCase() === key.toLowerCase()) output.push(child);
    if (child && typeof child === "object") collect(child, key, output);
  }
  return output;
}

function normalizedPayload(response) {
  const body = response?.Response || response?.Body || response || {};
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : typeof body === "string" ? body : "";
  const values = (key) => text ? xmlValues(text, key) : collect(body, key).flatMap((item) => Array.isArray(item) ? item : [item]).map(String);
  const scores = values("Score").map(Number).filter(Number.isFinite);
  const hitFlags = values("HitFlag").map(Number).filter(Number.isFinite);
  const results = values("Result").map(Number).filter(Number.isFinite);
  const states = values("State");
  const jobIds = values("JobId");
  const labels = [...new Set([...values("Label"), ...values("SubLabel")].filter(Boolean))].slice(0, 12);
  return { scores, hitFlags, results, states, jobIds, labels, maxScore: scores.length ? Math.max(...scores) : null };
}

function decide(summary) {
  if (summary.hitFlags.includes(1) || summary.results.includes(1) || (summary.maxScore !== null && summary.maxScore >= rejectScore)) {
    return { action: "REJECT", reasonCode: summary.labels[0] || "AUTOMATED_POLICY_VIOLATION", severity: "HIGH" };
  }
  if (summary.results.includes(2) || (summary.maxScore !== null && summary.maxScore >= manualScore)) {
    return { action: "ESCALATE", reasonCode: summary.labels[0] || "AUTOMATED_SUSPECTED", severity: "MEDIUM" };
  }
  const completed = summary.states.length === 0 || summary.states.some((state) => /success|finish/i.test(state));
  const explicitNormal = summary.results.includes(0) || (summary.hitFlags.length > 0 && summary.hitFlags.every((flag) => flag === 0));
  if (completed && explicitNormal) return { action: "APPROVE", reasonCode: "AUTOMATED_NORMAL", severity: "LOW" };
  return { action: "ESCALATE", reasonCode: "AUTOMATED_UNKNOWN_RESPONSE", severity: "MEDIUM" };
}

async function auditImage(storageKey) {
  return request({
    Method: "GET",
    Key: storageKey,
    Query: { "ci-process": "sensitive-content-recognition", "detect-type": detectTypes.map((value) => value.toLowerCase()).join(",") },
  });
}

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

async function auditVideo(storageKey) {
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;
  const body = `<Request><Input><Object>${escapeXml(storageKey)}</Object></Input><Conf><DetectType>${escapeXml(detectTypes.join(","))}</DetectType><CallbackVersion>Detail</CallbackVersion></Conf></Request>`;
  const submitted = await request({ Method: "POST", Url: `https://${bucket}.ci.${region}.myqcloud.com/video/auditing`, Body: body, ContentType: "application/xml" });
  const submission = normalizedPayload(submitted);
  const jobId = submission.jobIds[0];
  if (!jobId) throw new Error("Tencent CI video audit did not return a job id");
  const deadline = Date.now() + Number(process.env.CONTENT_REVIEW_VIDEO_TIMEOUT_MS || 600_000);
  while (Date.now() < deadline) {
    await sleep(10_000);
    const response = await request({ Method: "GET", Url: `https://${bucket}.ci.${region}.myqcloud.com/video/auditing/${encodeURIComponent(jobId)}` });
    const summary = normalizedPayload(response);
    summary.jobIds = summary.jobIds.length ? summary.jobIds : [jobId];
    if (summary.states.some((state) => /fail|cancel/i.test(state))) throw new Error(`Tencent CI video audit failed: ${summary.states.join(",")}`);
    if (summary.states.length === 0 || summary.states.some((state) => /success|finish/i.test(state))) return { response, summary };
  }
  throw new Error("Tencent CI video audit timed out");
}

async function postDecision(reviewId, decision, metadata) {
  const body = JSON.stringify({ ...decision, note: `腾讯云自动审核：${decision.reasonCode}`, metadata });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", process.env.CONTENT_REVIEW_INTERNAL_SECRET).update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(`${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/admin/reviews/${reviewId}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-review-timestamp": timestamp, "x-review-signature": signature },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 409) return payload;
  if (!response.ok) throw new Error(`Review settlement failed: ${response.status} ${payload?.code || "UNKNOWN"}`);
  return payload;
}

const worker = new Worker("moderation", async (job) => {
  const found = await pool.query(
    `SELECT r.id, r.status, a.id AS asset_id, a.storage_key, a.mime_type
     FROM content_review_records r JOIN assets a ON a.id = r.asset_id
     WHERE r.id = $1 AND a.id = $2`,
    [job.data.reviewId, job.data.assetId],
  );
  const review = found.rows[0];
  if (!review || !["PENDING", "NEEDS_MANUAL"].includes(review.status)) return { skipped: true };
  try {
    const audited = review.mime_type.startsWith("video/") ? await auditVideo(review.storage_key) : { response: await auditImage(review.storage_key) };
    const summary = audited.summary || normalizedPayload(audited.response);
    const decision = decide(summary);
    return await postDecision(review.id, decision, { provider: "tencent-ci", providerJobId: summary.jobIds[0] || null, detectTypes, summary, automatedAt: new Date().toISOString() });
  } catch (error) {
    const finalAttempt = job.attemptsMade + 1 >= Number(job.opts.attempts || 1);
    if (!finalAttempt) throw error;
    return postDecision(review.id, { action: "ESCALATE", reasonCode: "AUTOMATED_PROVIDER_ERROR", severity: "MEDIUM" }, { provider: "tencent-ci", providerError: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN", automatedAt: new Date().toISOString() });
  }
}, {
  connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null },
  concurrency: 2,
});

worker.on("completed", (job) => log("info", "moderation_completed", { taskId: job.id, reviewId: job.data?.reviewId }));
worker.on("failed", (job, error) => log("error", "moderation_failed", { taskId: job?.id, reviewId: job?.data?.reviewId, error }));
heartbeat().catch((error) => console.error("initial moderation heartbeat failed", error));
const heartbeatTimer = setInterval(() => heartbeat().catch((error) => console.error("moderation heartbeat failed", error)), 30_000);

for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, async () => {
  clearInterval(heartbeatTimer);
  await worker.close();
  await pool.end();
  process.exit(0);
});
