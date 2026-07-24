import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { Queue, Worker } from "bullmq";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";
import { installStructuredConsole, log } from "./structured-logger.mjs";

installStructuredConsole("aigc-worker");

const { Pool } = pg;
const required = ["DATABASE_URL", "REDIS_URL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const redisUrl = new URL(process.env.REDIS_URL);
const workerId = `${process.env.HOSTNAME || "worker"}:${process.pid}`;
const moderationQueue = process.env.CONTENT_REVIEW_PROVIDER === "tencent-ci" ? new Queue("moderation", { connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null } }) : null;

async function heartbeat() {
  await pool.query(
    "INSERT INTO worker_heartbeats (worker_id, last_seen_at, details_json) VALUES ($1, NOW(), $2::jsonb) ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, details_json = EXCLUDED.details_json",
    [workerId, JSON.stringify({ kind: "generation", pid: process.pid, concurrency: 2 })],
  );
}

function redactForLog(value) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "[url]"; }
    }
    return value.slice(0, 1000);
  }
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => (/authorization|token|secret|signature/i.test(key) ? [key, "[redacted]"] : [key, redactForLog(child)])));
  return value;
}

async function logProviderCall(taskId, operation, request, responseStatus, response, errorCode = null, providerRequestId = null) {
  try {
    await pool.query(
      "INSERT INTO provider_call_logs (task_id, provider, operation, request_json, response_status, response_json, error_code, provider_request_id) VALUES ($1, 'ark', $2, $3::jsonb, $4, $5::jsonb, $6, $7)",
      [taskId, operation, JSON.stringify(redactForLog(request)), responseStatus, JSON.stringify(redactForLog(response || {})), errorCode, providerRequestId],
    );
  } catch (error) { console.error("provider call log failed", error); }
}

function cosUrl(Key, Method = "GET", Expires = 3600) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Key, Method, Sign: true, Expires }, (error, data) => {
      if (error || !data?.Url) reject(error || new Error("COS signed URL missing"));
      else resolve(data.Url);
    });
  });
}

function putObject(Key, Body, ContentType) {
  return new Promise((resolve, reject) => {
    cos.putObject({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Key, Body, ContentType }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function deleteObject(Key) {
  return new Promise((resolve) => {
    cos.deleteObject({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Key }, () => resolve());
  });
}

async function sophnet(path, init = {}) {
  if (!process.env.AI_API_KEY || !process.env.AI_MODEL || !process.env.AI_BASE_URL) {
    throw new Error("Image provider is not configured");
  }
  const response = await fetch(`${process.env.AI_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`SophNet ${response.status}: ${payload?.message || "request failed"}`);
  return payload;
}

async function createImageTask(inputUrls, prompt) {
  const payload = await sophnet("/task", {
    method: "POST",
    body: JSON.stringify({ model: process.env.AI_MODEL, input: { prompt, images: inputUrls } }),
  });
  const taskId = payload?.output?.taskId;
  if (!taskId) throw new Error("SophNet did not return taskId");
  return taskId;
}

function findVideoUrl(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.video_url === "string") return value.video_url;
  if (typeof value.url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(value.url)) return value.url;
  for (const child of Object.values(value)) {
    const found = findVideoUrl(child);
    if (found) return found;
  }
  return null;
}

async function createVideoTask(inputUrls, input, workflowKey, taskId) {
  if (!process.env.ARK_API_KEY) throw new Error("ARK_API_KEY is required for video generation");
  const mimeTypes = input.assetMimeTypes || [];
  const templateDirection = typeof input.promptConfig?.template === "string" ? input.promptConfig.template : "按用户脚本和全部参考素材生成原创短片。";
  const content = [{ type: "text", text: [
    `生成一支${input.scene}方向的电商带货短视频，整体节奏为${input.style}，画幅比例${input.aspectRatio}，时长 ${input.duration} 秒，分辨率 ${input.resolution}。`,
    templateDirection,
    input.prompt || "保持商品主体、颜色、标识与关键细节准确，不添加水印。",
  ].join("\n") }];
  inputUrls.forEach((url, index) => {
    const mime = mimeTypes[index] || "";
    if (mime.startsWith("image/")) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    if (mime === "video/mp4") content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    if (mime.startsWith("audio/")) content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
  });
  const requestBody = { model: process.env.ARK_MODEL || "doubao-seedance-2-0-260128", content, generate_audio: true, ratio: input.aspectRatio, duration: input.duration, resolution: input.resolution, watermark: input.promptConfig?.watermark === true };
  const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const payload = await response.json().catch(() => null);
  await logProviderCall(taskId, "create_video_task", { model: requestBody.model, ratio: requestBody.ratio, duration: requestBody.duration, resolution: requestBody.resolution, watermark: requestBody.watermark, promptConfig: input.promptConfig ? { id: input.promptConfig.id, version: input.promptConfig.version, variantKey: input.promptConfig.variantKey } : null, assetTypes: mimeTypes }, response.status, payload, response.ok ? null : "ARK_CREATE_FAILED", payload?.id || response.headers.get("x-request-id"));
  if (!response.ok || !payload?.id) throw new Error(`Ark ${response.status}: ${payload?.error?.message || "task creation failed"}`);
  return payload.id;
}

async function waitForVideo(taskId, generationTaskId) {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`, { headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}` } });
    const payload = await response.json().catch(() => null);
    await logProviderCall(generationTaskId, "get_video_task", { providerTaskId: taskId }, response.status, payload, response.ok ? null : "ARK_QUERY_FAILED", taskId);
    if (!response.ok) throw new Error(`Ark ${response.status}: ${payload?.error?.message || "task query failed"}`);
    const status = String(payload?.status || "").toLowerCase();
    if (["succeeded", "success", "completed"].includes(status)) {
      const url = findVideoUrl(payload);
      if (!url) throw new Error("Ark task succeeded without a video URL");
      return url;
    }
    if (["failed", "rejected", "canceled", "cancelled", "expired"].includes(status)) throw new Error(`Ark task ${payload?.status}: ${payload?.error?.message || "generation failed"}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Ark video task timed out");
}

async function waitForImage(taskId) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const payload = await sophnet(`/task/${taskId}`);
    const output = payload?.output;
    if (output?.taskStatus === "SUCCEEDED") {
      const url = output.results?.[0]?.url;
      if (!url) throw new Error("SophNet task succeeded without an image");
      return url;
    }
    if (!["PENDING", "RUNNING"].includes(output?.taskStatus)) {
      throw new Error(`SophNet task ${output?.taskStatus || "UNKNOWN"}: ${output?.message || output?.code || "failed"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("SophNet task timed out");
}

async function generateOne(inputUrls, input, index, workflowKey) {
  const variation = ["正面居中构图", "轻微侧角构图", "留出营销文案空间", "更强调商品材质细节"][index] || "商业构图";
  const detailStage = ["品牌定位与首屏商品展示长图", "核心卖点解析长图", "材质、结构与工艺细节长图", "真实使用场景与效果长图", "规格、服务与购买理由长图"][index] || "商品详情长图";
  const shared = workflowKey === "hd-enhance"
    ? "保持原图的主体、构图、比例、颜色、文字和关键细节准确，不新增、不删除或替换任何内容，不添加水印。"
    : workflowKey === "white-background"
    ? "精确抠出商品主体，生成干净纯白电商背景，保留真实材质、边缘、标识与自然轻投影，不添加文字、水印或额外商品。"
    : workflowKey === "resize-image"
    ? "保持原图商品主体、材质、颜色、标识与关键细节完全准确；仅自然延展周边画面以适配目标比例，不裁切主体，不添加文字、水印或额外商品。"
    : ["recreate-product-hero", "recreate-detail-page"].includes(workflowKey)
    ? "参考输入图的构图层级、留白和商业视觉方向，使用同一商品制作原创电商视觉；不得复制原图的文字、品牌、人物或具体画面，不添加水印。"
    : "保持商品主体的形状、颜色、商标和关键细节准确，不改变产品本身，不添加文字、水印或额外商品。";
  const taskPrompt = workflowKey === "model-wear"
    ? `以第一张图片中的模特为主体，将后续图片中的服装或商品自然穿戴到模特身上。保持模特身份、面部、体型和人体结构自然，服装版型、材质、颜色和图案准确。场景为${input.scene}，风格为${input.style}，${variation}，画幅比例${input.aspectRatio}。`
    : workflowKey === "hd-enhance"
    ? `对原图进行${input.scene}高清优化，策略为${input.style}。重点修复压缩噪点、边缘锯齿和模糊细节，保持画面自然，避免过度锐化、塑料感或内容重绘。`
    : workflowKey === "white-background"
    ? `生成${input.scene}商品图，风格为${input.style}。主体居中、完整可见，边缘干净，背景为均匀纯白。`
    : workflowKey === "resize-image"
    ? `将图片调整为${input.aspectRatio}比例，采用${input.scene}与${input.style}策略，仅对主体外区域进行真实、连续的扩展。`
    : workflowKey === "recreate-product-hero"
    ? `基于参考图的${input.scene}方向生成原创商品首屏主图，风格为${input.style}，${variation}，画幅比例${input.aspectRatio}。`
    : workflowKey === "recreate-detail-page"
    ? `生成原创商品详情页中的${detailStage}，参考${input.scene}，风格为${input.style}；各张图表达不同卖点，画幅比例${input.aspectRatio}，不生成文字、水印或价格。`
    : workflowKey === "product-detail-page"
    ? `生成商品详情页中的${detailStage}。五张长图必须围绕不同商品特性表达，不得重复构图或重复卖点；从输入商品中识别可见的材质、结构、用途和适用人群。整体为${input.scene}视觉方向和${input.style}风格，${variation}，竖向长图画幅比例${input.aspectRatio}。为后续商家排版保留清晰、干净的图文留白，但画面内不要生成文字、价格、标签或水印。`
    : workflowKey === "scene-image"
    ? `将商品自然融入${input.scene}场景，风格为${input.style}，${variation}，画幅比例${input.aspectRatio}，真实商业摄影，场景光线与商品接触阴影自然，突出商品主体。`
    : `生成${input.scene}环境中的${input.style}电商商品主图，${variation}，画幅比例${input.aspectRatio}，真实摄影，干净背景，柔和自然阴影。`;
  const prompt = [shared, taskPrompt, input.prompt ? `用户补充要求：${input.prompt}` : ""].filter(Boolean).join("\n");
  const providerTaskId = await createImageTask(inputUrls, prompt);
  return waitForImage(providerTaskId);
}

async function generateVideo(inputUrls, input, workflowKey, taskId) {
  return waitForVideo(await createVideoTask(inputUrls, input, workflowKey, taskId), taskId);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}
async function generateMix(inputUrls, input, task) {
  const dir = await mkdtemp(join(tmpdir(), "aigc-mix-"));
  try {
    const files = await Promise.all(inputUrls.map(async (url, index) => { const response = await fetch(url); if (!response.ok) throw new Error("MIX_SOURCE_DOWNLOAD_FAILED"); const file = join(dir, `${index}.mp4`); await writeFile(file, Buffer.from(await response.arrayBuffer())); return file; }));
    const list = join(dir, "inputs.txt"); await writeFile(list, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
    const output = join(dir, "output.mp4");
    await run("/usr/bin/ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-t", String(input.duration), "-vf", `scale=${input.aspectRatio === "9:16" ? "720:1280" : "1280:720"}:force_original_aspect_ratio=decrease,pad=${input.aspectRatio === "9:16" ? "720:1280" : "1280:720"}:(ow-iw)/2:(oh-ih)/2`, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", output]);
    const key = `temporary/${task.user_id}/${task.id}-${randomUUID()}.mp4`;
    await putObject(key, await readFile(output), "video/mp4");
    return { url: await cosUrl(key, "GET", 900), temporaryKey: key };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function submitForReview(task, savedAssets) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT status FROM generation_tasks WHERE id = $1 FOR UPDATE", [task.id]);
    if (!["QUEUED", "RUNNING"].includes(current.rows[0]?.status)) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      "UPDATE generation_tasks SET status = 'PENDING_REVIEW', output_json = $2::jsonb, error_code = NULL, updated_at = NOW() WHERE id = $1",
      [task.id, JSON.stringify({ assets: savedAssets })],
    );
    const reviews = [];
    for (const asset of savedAssets) {
      const review = await client.query(
        `INSERT INTO content_review_records (asset_id, task_id, phase, status, review_source, metadata_json)
         VALUES ($1, $2, 'GENERATED_OUTPUT', 'PENDING', 'SYSTEM', $3::jsonb)
         ON CONFLICT (asset_id) WHERE status IN ('PENDING', 'NEEDS_MANUAL') DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [asset.assetId, task.id, JSON.stringify({ workflowKey: task.workflow_key, generatedBy: workerId })],
      );
      if (review.rows[0]?.id) reviews.push({ reviewId: review.rows[0].id, assetId: asset.assetId });
    }
    await client.query("COMMIT");
    if (moderationQueue) {
      for (const review of reviews) {
        try { await moderationQueue.add("moderate-content", review, { jobId: review.reviewId, attempts: 4, backoff: { type: "exponential", delay: 15_000 }, removeOnComplete: 500, removeOnFail: 500 }); }
        catch (error) { console.error(`could not enqueue automatic review ${review.reviewId}; review remains manual`, error); }
      }
    }
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function settleFailure(taskId, message) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT t.id, t.user_id, t.workflow_key, t.points, t.status, u.email FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE OF t",
      [taskId],
    );
    const task = result.rows[0];
    if (!task || ["SUCCEEDED", "FAILED", "REJECTED", "CANCELED"].includes(task.status)) {
      await client.query("ROLLBACK");
      return;
    }
    const wallet = await client.query("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [task.user_id]);
    const balance = wallet.rows[0].available_points;
    await client.query("UPDATE generation_tasks SET status = 'FAILED', error_code = $2, updated_at = NOW() WHERE id = $1", [task.id, message.slice(0, 200)]);
    await client.query(
      "UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1",
      [task.user_id, task.points],
    );
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
      [task.user_id, task.points, balance + task.points, task.id, `refund:${task.id}`],
    );
    if (task.email) {
      const html = `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2><p>任务 <strong>${task.id}</strong> 执行失败，${task.points} 积分已自动退回。</p><p><a href="${process.env.PUBLIC_APP_URL || "https://aigc.bigapple.store"}/tasks/${task.id}">查看任务详情</a></p></div>`;
      await client.query(
        `INSERT INTO notification_outbox (user_id, recipient, event_type, subject, html_body, idempotency_key)
         VALUES ($1, $2, 'TASK_FAILED', '你的创作任务未完成', $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [task.user_id, task.email, html, `task_failed:${task.id}`],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function reconcileStaleTasks() {
  // The longest provider poll is 15 minutes. A 30-minute grace period avoids
  // reclaiming normal work while returning reservations stranded by a crash.
  const stale = await pool.query(
    `SELECT id FROM generation_tasks
     WHERE status IN ('QUEUED', 'RUNNING')
       AND updated_at < NOW() - INTERVAL '30 minutes'
     ORDER BY updated_at ASC
     LIMIT 100`,
  );
  for (const task of stale.rows) {
    await settleFailure(task.id, "TASK_TIMEOUT");
    console.warn(`reclaimed stale task ${task.id}`);
  }
}

const worker = new Worker("generation", async (job) => {
  const taskResult = await pool.query("SELECT id, user_id, workflow_key, points, input_json, request_id FROM generation_tasks WHERE id = $1", [job.data.taskId]);
  const task = taskResult.rows[0];
  if (!task) throw new Error("Task not found");
  log("info", "task_started", { requestId: task.request_id, taskId: task.id, userId: task.user_id, workflowKey: task.workflow_key });
  const claimed = await pool.query("UPDATE generation_tasks SET status = 'RUNNING', updated_at = NOW() WHERE id = $1 AND status = 'QUEUED' RETURNING id", [task.id]);
  if (!claimed.rowCount) return { skipped: true };
  const savedKeys = [];
  let temporaryKeys = [];
  try {
    const storageKeys = task.input_json.storageKeys || [task.input_json.storageKey];
    const inputUrls = await Promise.all(storageKeys.map((key) => cosUrl(key, "GET", 3600)));
    const temporaryOutputs = task.workflow_key === "video-mix"
      ? [await generateMix(inputUrls, task.input_json, task)]
      : ["product-ad-video", "recreate-video", "seedance-video"].includes(task.workflow_key)
      ? [{ url: await generateVideo(inputUrls, task.input_json, task.workflow_key, task.id), temporaryKey: null }]
      : (await Promise.all(Array.from({ length: task.input_json.outputs || 4 }, (_, index) => generateOne(inputUrls, task.input_json, index, task.workflow_key)))).map((url) => ({ url, temporaryKey: null }));
    temporaryKeys = temporaryOutputs.flatMap((output) => output.temporaryKey ? [output.temporaryKey] : []);
    const savedAssets = [];
    for (const [index, output] of temporaryOutputs.entries()) {
      const response = await fetch(output.url);
      if (!response.ok) throw new Error(`Could not download provider output ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const isVideoTask = ["product-ad-video", "recreate-video", "seedance-video", "video-mix"].includes(task.workflow_key);
      const contentType = response.headers.get("content-type")?.split(";")[0] || (isVideoTask ? "video/mp4" : "image/png");
      const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : contentType === "video/webm" ? "webm" : contentType.startsWith("video/") ? "mp4" : "png";
      const key = `users/${task.user_id}/outputs/${task.id}/${index + 1}-${randomUUID()}.${extension}`;
      await putObject(key, buffer, contentType);
      savedKeys.push(key);
      const asset = await pool.query(
        `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name, metadata_json)
         VALUES ($1, 'OUTPUT', $2, $3, $4, 'PENDING_REVIEW', $5, $6::jsonb) RETURNING id`,
        [task.user_id, key, contentType, buffer.length, `${task.workflow_key}-${index + 1}.${extension}`, JSON.stringify({ taskId: task.id, workflowKey: task.workflow_key, provider: isVideoTask ? "ark" : "sophnet", model: isVideoTask ? (process.env.ARK_MODEL || "doubao-seedance-2-0-260128") : process.env.AI_MODEL, aiGenerated: true, aiContentLabel: "AI_GENERATED", provenance: { generatedAt: new Date().toISOString(), workerId }, moderation: { status: "PENDING_REVIEW" } })],
      );
      savedAssets.push({ assetId: asset.rows[0].id, storageKey: key });
    }
    const settled = await submitForReview(task, savedAssets);
    if (!settled) {
      await Promise.all(savedKeys.map(deleteObject));
      await pool.query("DELETE FROM assets WHERE id = ANY($1::uuid[])", [savedAssets.map((asset) => asset.assetId)]);
      return { skipped: true };
    }
    return { outputs: savedAssets.length };
  } catch (error) {
    await Promise.all(savedKeys.map(deleteObject));
    await settleFailure(task.id, error instanceof Error ? error.message : "GENERATION_FAILED");
    throw error;
  } finally {
    const cleanup = await Promise.allSettled(temporaryKeys.map(deleteObject));
    const failed = cleanup.filter((result) => result.status === "rejected").length;
    if (failed) console.error(`task ${task.id} temporary object cleanup failed for ${failed} object(s)`);
  }
}, {
  connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null },
  concurrency: 2,
});

worker.on("completed", (job) => log("info", "task_completed", { taskId: job.id }));
worker.on("failed", (job, error) => log("error", "task_failed", { taskId: job?.id, error }));

function smtpCommand(socket, command, accepted) {
  return new Promise((resolve, reject) => {
    let response = "";
    const cleanup = () => { socket.off("data", onData); socket.off("error", onError); socket.off("timeout", onTimeout); };
    const onError = (error) => { cleanup(); reject(error); };
    const onTimeout = () => { cleanup(); reject(new Error("SMTP connection timed out")); };
    const onData = (chunk) => {
      response += chunk.toString("utf8");
      const last = response.trimEnd().split(/\r?\n/).at(-1) || "";
      if (!/^\d{3} /.test(last)) return;
      cleanup();
      const status = Number(last.slice(0, 3));
      if (accepted.includes(status)) resolve(response);
      else reject(new Error(`SMTP rejected command with status ${status}`));
    };
    socket.on("data", onData); socket.on("error", onError); socket.on("timeout", onTimeout);
    if (command) socket.write(`${command}\r\n`);
  });
}

async function sendOutboxEmail(message) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP is not configured");
  const socket = tls.connect({ host, port: Number(process.env.SMTP_PORT || 465), servername: host, rejectUnauthorized: true });
  socket.setTimeout(10_000);
  try {
    await smtpCommand(socket, "", [220]);
    await smtpCommand(socket, "EHLO aigc.bigapple.store", [250]);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(user).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(pass).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${user}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${message.recipient}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    const subject = `=?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`;
    const fromName = `=?UTF-8?B?${Buffer.from("芭乐AIGC").toString("base64")}?=`;
    const body = message.html_body.replace(/\r?\n\./g, "\r\n..");
    await smtpCommand(socket, [`From: ${fromName} <${user}>`, `To: <${message.recipient}>`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body, "."].join("\r\n"), [250]);
    await smtpCommand(socket, "QUIT", [221]);
  } finally { socket.destroy(); }
}

async function dispatchNotifications() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  await pool.query("UPDATE notification_outbox SET status = 'FAILED', last_error = COALESCE(last_error, 'DISPATCH_INTERRUPTED'), next_attempt_at = NOW(), updated_at = NOW() WHERE status = 'SENDING' AND updated_at < NOW() - INTERVAL '5 minutes'");
  const client = await pool.connect();
  let messages = [];
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT id, recipient, subject, html_body, attempts FROM notification_outbox
       WHERE status IN ('PENDING', 'FAILED') AND attempts < 5 AND next_attempt_at <= NOW()
       ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 10`,
    );
    messages = selected.rows;
    if (messages.length) await client.query("UPDATE notification_outbox SET status = 'SENDING', attempts = attempts + 1, updated_at = NOW() WHERE id = ANY($1::uuid[])", [messages.map((message) => message.id)]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  for (const message of messages) {
    try {
      await sendOutboxEmail(message);
      await pool.query("UPDATE notification_outbox SET status = 'SENT', sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1", [message.id]);
    } catch (error) {
      const delayMinutes = Math.min(60, 2 ** Math.min(message.attempts + 1, 5));
      await pool.query("UPDATE notification_outbox SET status = 'FAILED', last_error = $2, next_attempt_at = NOW() + ($3 * INTERVAL '1 minute'), updated_at = NOW() WHERE id = $1", [message.id, error instanceof Error ? error.message.slice(0, 500) : "EMAIL_SEND_FAILED", delayMinutes]);
    }
  }
}

heartbeat().catch((error) => console.error("initial worker heartbeat failed", error));
const heartbeatTimer = setInterval(() => heartbeat().catch((error) => console.error("worker heartbeat failed", error)), 30_000);
reconcileStaleTasks().catch((error) => console.error("initial stale-task reconciliation failed", error));
const reconciliationTimer = setInterval(() => reconcileStaleTasks().catch((error) => console.error("stale-task reconciliation failed", error)), 5 * 60_000);
dispatchNotifications().catch((error) => console.error("initial notification dispatch failed", error));
const notificationTimer = setInterval(() => dispatchNotifications().catch((error) => console.error("notification dispatch failed", error)), 15_000);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    await worker.close();
    if (moderationQueue) await moderationQueue.close();
    clearInterval(heartbeatTimer);
    clearInterval(reconciliationTimer);
    clearInterval(notificationTimer);
    await pool.end();
    process.exit(0);
  });
}
