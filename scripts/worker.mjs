import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";

const { Pool } = pg;
const required = ["DATABASE_URL", "REDIS_URL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const redisUrl = new URL(process.env.REDIS_URL);

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
  const response = await fetch(`${process.env.AI_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`SophNet ${response.status}: ${payload?.message || "request failed"}`);
  return payload;
}

async function createImageTask(inputUrl, prompt) {
  const payload = await sophnet("/task", {
    method: "POST",
    body: JSON.stringify({ model: process.env.AI_MODEL, input: { prompt, images: [inputUrl] } }),
  });
  const taskId = payload?.output?.taskId;
  if (!taskId) throw new Error("SophNet did not return taskId");
  return taskId;
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

async function generateOne(inputUrl, input, index, workflowKey) {
  const variation = ["正面居中构图", "轻微侧角构图", "留出营销文案空间", "更强调商品材质细节"][index] || "商业构图";
  const shared = "保持商品主体的形状、颜色、商标和关键细节准确，不改变产品本身，不添加文字、水印或额外商品。";
  const taskPrompt = workflowKey === "scene-image"
    ? `将商品自然融入${input.scene}场景，风格为${input.style}，${variation}，画幅比例${input.aspectRatio}，真实商业摄影，场景光线与商品接触阴影自然，突出商品主体。`
    : `生成${input.scene}环境中的${input.style}电商商品主图，${variation}，画幅比例${input.aspectRatio}，真实摄影，干净背景，柔和自然阴影。`;
  const prompt = [shared, taskPrompt, input.prompt ? `用户补充要求：${input.prompt}` : ""].filter(Boolean).join("\n");
  const providerTaskId = await createImageTask(inputUrl, prompt);
  return waitForImage(providerTaskId);
}

async function settleSuccess(task, savedAssets) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT status FROM generation_tasks WHERE id = $1 FOR UPDATE", [task.id]);
    if (current.rows[0]?.status === "SUCCEEDED") {
      await client.query("ROLLBACK");
      return;
    }
    await client.query(
      "UPDATE generation_tasks SET status = 'SUCCEEDED', output_json = $2::jsonb, error_code = NULL, updated_at = NOW() WHERE id = $1",
      [task.id, JSON.stringify({ assets: savedAssets })],
    );
    await client.query(
      "UPDATE wallets SET frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1",
      [task.user_id, task.points],
    );
    const wallet = await client.query("SELECT available_points FROM wallets WHERE user_id = $1", [task.user_id]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'SETTLE', 0, $2, 'GENERATION_TASK', $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
      [task.user_id, wallet.rows[0].available_points, task.id, `settle:${task.id}`],
    );
    await client.query("COMMIT");
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
    const result = await client.query("SELECT id, user_id, points, status FROM generation_tasks WHERE id = $1 FOR UPDATE", [taskId]);
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
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const worker = new Worker("generation", async (job) => {
  const taskResult = await pool.query("SELECT id, user_id, workflow_key, points, input_json FROM generation_tasks WHERE id = $1", [job.data.taskId]);
  const task = taskResult.rows[0];
  if (!task) throw new Error("Task not found");
  await pool.query("UPDATE generation_tasks SET status = 'RUNNING', updated_at = NOW() WHERE id = $1 AND status = 'QUEUED'", [task.id]);
  const savedKeys = [];
  try {
    const inputUrl = await cosUrl(task.input_json.storageKey, "GET", 3600);
    const temporaryUrls = await Promise.all(Array.from({ length: task.input_json.outputs || 4 }, (_, index) => generateOne(inputUrl, task.input_json, index, task.workflow_key)));
    const savedAssets = [];
    for (const [index, url] of temporaryUrls.entries()) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not download provider output ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type")?.split(";")[0] || "image/png";
      const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
      const key = `users/${task.user_id}/outputs/${task.id}/${index + 1}-${randomUUID()}.${extension}`;
      await putObject(key, buffer, contentType);
      savedKeys.push(key);
      const asset = await pool.query(
        `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name, metadata_json)
         VALUES ($1, 'OUTPUT', $2, $3, $4, 'READY', $5, $6::jsonb) RETURNING id`,
        [task.user_id, key, contentType, buffer.length, `${task.workflow_key}-${index + 1}.${extension}`, JSON.stringify({ taskId: task.id, workflowKey: task.workflow_key, provider: "sophnet", model: process.env.AI_MODEL })],
      );
      savedAssets.push({ assetId: asset.rows[0].id, storageKey: key });
    }
    await settleSuccess(task, savedAssets);
    return { outputs: savedAssets.length };
  } catch (error) {
    await Promise.all(savedKeys.map(deleteObject));
    await settleFailure(task.id, error instanceof Error ? error.message : "GENERATION_FAILED");
    throw error;
  }
}, {
  connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null },
  concurrency: 2,
});

worker.on("completed", (job) => console.log(`task ${job.id} completed`));
worker.on("failed", (job, error) => console.error(`task ${job?.id || "unknown"} failed`, error.message));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    await worker.close();
    await pool.end();
    process.exit(0);
  });
}
