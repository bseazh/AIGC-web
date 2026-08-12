import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { Queue, Worker } from "bullmq";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";
import sharp from "sharp";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { installStructuredConsole, log } from "./structured-logger.mjs";

installStructuredConsole("aigc-worker");

function loadLocalEnv() {
  const candidates = process.env.NODE_ENV === "production"
    ? [".env.production", ".env.local", ".env"]
    : [".env.local", ".env"];
  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (!envPath) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

const { Pool } = pg;
const required = ["DATABASE_URL", "REDIS_URL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const redisUrl = new URL(process.env.REDIS_URL);
const workerId = `${process.env.HOSTNAME || "worker"}:${process.pid}`;
const contentReviewEnabled = process.env.CONTENT_REVIEW_ENABLED === "true";
const moderationQueue = contentReviewEnabled && process.env.CONTENT_REVIEW_PROVIDER === "tencent-ci" ? new Queue("moderation", { connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null } }) : null;

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

async function logProviderCall(taskId, provider, operation, request, responseStatus, response, errorCode = null, providerRequestId = null) {
  try {
    await pool.query(
      "INSERT INTO provider_call_logs (task_id, provider, operation, request_json, response_status, response_json, error_code, provider_request_id) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8)",
      [taskId, provider, operation, JSON.stringify(redactForLog(request)), responseStatus, JSON.stringify(redactForLog(response || {})), errorCode, providerRequestId],
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

function sophnetUrl(path) {
  return `${String(process.env.AI_BASE_URL || "").replace(/\/$/, "")}${path}`;
}

function googleAiUrl(path, apiKey) {
  const baseUrl = (process.env.GOOGLE_AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const separator = path.includes("?") ? "&" : "?";
  return `${baseUrl}${path}${separator}key=${encodeURIComponent(apiKey)}`;
}

function googleProxyUrl() {
  return process.env.GOOGLE_AI_PROXY_URL || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
}

async function googleFetch(url, init = {}) {
  const proxyUrl = googleProxyUrl();
  if (!proxyUrl) return fetch(url, init);
  return undiciFetch(url, { ...init, dispatcher: new ProxyAgent(proxyUrl) });
}

async function sophnet(path, init = {}, audit = {}) {
  if (!process.env.AI_API_KEY || !process.env.AI_MODEL || !process.env.AI_BASE_URL) {
    throw new Error("Image provider is not configured");
  }
  const requestLog = { path, method: init.method || "GET", model: process.env.AI_MODEL, ...audit.request };
  try {
    const response = await fetch(sophnetUrl(path), {
      ...init,
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const payload = await response.json().catch(() => null);
    const providerRequestId = payload?.output?.taskId || audit.providerTaskId || response.headers.get("x-request-id");
    await logProviderCall(audit.taskId, "sophnet", audit.operation || "request", requestLog, response.status, payload, response.ok ? null : "SOPHNET_HTTP_ERROR", providerRequestId);
    if (!response.ok) throw new Error(`SophNet ${response.status}: ${payload?.message || "request failed"}`);
    return payload;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("SophNet ")) {
      await logProviderCall(audit.taskId, "sophnet", audit.operation || "request", requestLog, 0, {}, "SOPHNET_NETWORK_ERROR", audit.providerTaskId || null);
    }
    throw error;
  }
}

async function createSophnetImage(inputUrls, prompt, generationTaskId, outputIndex, input = {}, referencePlan = []) {
  const model = process.env.AI_MODEL || "Doubao-Seedream-5.0-pro";
  const size = input.imageResolution === "2K" ? "2K" : "1K";
  const payload = await sophnet("", {
    method: "POST",
    body: JSON.stringify({
      model,
      prompt,
      size,
      watermark: false,
      ...(inputUrls.length ? { image: inputUrls } : {}),
    }),
  }, { taskId: generationTaskId, operation: "generate_image", request: { outputIndex, inputCount: inputUrls.length, referenceRoles: referencePlan.map((item) => item.label), promptLength: prompt.length, size } });
  const url = payload?.data?.[0]?.url;
  if (!url) throw new Error("SophNet Seedream did not return an image URL");
  return { url, temporaryKey: null, provider: "sophnet", model: payload?.model || model };
}

function geminiImageResponse(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = candidates.flatMap((candidate) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []);
  const imagePart = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
  const text = parts.map((part) => typeof part?.text === "string" ? part.text.trim() : "").filter(Boolean).join(" ");
  return {
    inlineData: imagePart?.inlineData || imagePart?.inline_data || null,
    text,
    finishReason: candidates.map((candidate) => candidate?.finishReason).find(Boolean) || payload?.promptFeedback?.blockReason || "UNKNOWN",
  };
}

function geminiImageFailureMessage(status, payload, parsed, attempts) {
  const providerMessage = payload?.error?.message || payload?.message;
  if (providerMessage) return `Gemini ${status}: ${providerMessage}`;
  const detail = parsed.text ? `；模型仅返回文字：${parsed.text.slice(0, 120)}` : "";
  return `Gemini ${status}: 未返回图片（${parsed.finishReason}，已尝试 ${attempts} 次）${detail}`;
}

async function createGeminiImage(inputUrls, prompt, generationTaskId, outputIndex, aspectRatio = "1:1", referencePlan = []) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY;
  const model = process.env.GOOGLE_IMAGE_MODEL || "gemini-2.5-flash-image";
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is required for Nano Banana image generation");
  const providerAspectRatio = nearestGeminiAspectRatio(aspectRatio);
  const responseAspectRatio = geminiImageResponseAspectRatio(providerAspectRatio);
  const imageParts = [];
  for (const [index, url] of inputUrls.entries()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not read Gemini input image ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0] || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    imageParts.push({
      inline_data: {
        mime_type: contentType,
        data: buffer.toString("base64"),
      },
    });
    if (index >= 2 && model === "gemini-2.5-flash-image") break;
  }
  const referenceParts = imageParts.flatMap((imagePart, index) => [
    {
      text: `参考图 ${index + 1}（${referencePlan[index]?.label || "内容参考图"}）：${referencePlan[index]?.cue || "必须在最终图片中落实这张参考图提供的主体、结构、材质或视觉信息，不得忽略。"}`,
    },
    imagePart,
  ]);
  const maxAttempts = 2;
  let lastFailure = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const retryDirection = attempt === 1 ? "" : [
      "上一次响应没有返回图片。现在必须直接执行图像生成。",
      "只输出最终图片数据，不要解释、确认、复述提示词或回复任何纯文字内容。",
    ].join("\n");
    const requestBody = {
      contents: [{
        parts: [
          { text: [prompt, retryDirection].filter(Boolean).join("\n") },
          ...referenceParts,
        ],
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        responseFormat: {
          image: {
            aspectRatio: responseAspectRatio,
          },
        },
      },
    };
    const response = await googleFetch(googleAiUrl(`/models/${model}:generateContent`, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const payload = await response.json().catch(() => null);
    const parsed = geminiImageResponse(payload);
    const errorCode = !response.ok ? "GEMINI_IMAGE_HTTP_ERROR" : !parsed.inlineData?.data ? "GEMINI_EMPTY_IMAGE_RESPONSE" : null;
    await logProviderCall(generationTaskId, "google-gemini", "generate_image", { model, outputIndex, inputCount: imageParts.length, referenceRoles: referencePlan.slice(0, imageParts.length).map((item) => item.label), promptLength: prompt.length, requestedAspectRatio: aspectRatio, providerAspectRatio, responseAspectRatio, attempt, responseModalities: ["IMAGE"] }, response.status, payload, errorCode, payload?.responseId || response.headers.get("x-request-id"));
    if (response.ok && parsed.inlineData?.data) {
      const buffer = Buffer.from(parsed.inlineData.data, "base64");
      const contentType = parsed.inlineData.mimeType || parsed.inlineData.mime_type || "image/png";
      const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
      const key = `temporary/gemini/${generationTaskId}/${outputIndex + 1}-${randomUUID()}.${extension}`;
      await putObject(key, buffer, contentType);
      return { url: await cosUrl(key, "GET", 3600), temporaryKey: key, provider: "google-gemini", model };
    }
    lastFailure = geminiImageFailureMessage(response.status, payload, parsed, attempt);
    const retryable = response.ok || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) break;
    await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
  }
  throw new Error(lastFailure || "Gemini image generation failed");
}

async function createGeminiImageWithSophnetFallback(inputUrls, prompt, generationTaskId, outputIndex, aspectRatio = "1:1", sophnetInput = {}, referencePlan = []) {
  try {
    return await createGeminiImage(inputUrls, prompt, generationTaskId, outputIndex, aspectRatio, referencePlan);
  } catch (error) {
    if (!sophnetImageConfigured()) throw error;
    const geminiMessage = error instanceof Error ? error.message : "Gemini image generation failed";
    log("warn", "gemini_image_fallback_to_sophnet", { taskId: generationTaskId, outputIndex, reason: geminiMessage.slice(0, 200) });
    try {
      return await createSophnetImage(inputUrls, prompt, generationTaskId, outputIndex, sophnetInput, referencePlan);
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "SophNet fallback failed";
      throw new Error(`${geminiMessage}; SophNet fallback failed: ${fallbackMessage}`);
    }
  }
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
  const recreateVideoDirective = workflowKey === "recreate-video"
    ? [
        "内置复刻导演指令：reference_video 只用于提取镜头节奏、动作走势、运镜、构图、景别变化和主体出现时机，不得复制原人物脸、原商品、原品牌、Logo、水印或原字幕。",
        "如果输入中包含动作结构十二宫格或十二宫格关键帧拼图，请优先把它当作镜头顺序、人体姿态、四肢方向、步伐重心和构图结构参考；其余图片素材用于替换原视频中的人物、服装、商品、背景或文字元素。",
        "生成时必须把上传的人物/模特/商品素材通配到原视频对应动作和展示段落里，即保留原视频动作参考和镜头结构，重生成原创替换内容。",
      ].join("\n")
    : "";
  const content = [{ type: "text", text: [
    `生成一支${input.scene}方向的电商带货短视频，整体节奏为${input.style}，画幅比例${input.aspectRatio}，时长 ${input.duration} 秒，分辨率 ${input.resolution}。`,
    templateDirection,
    recreateVideoDirective,
    input.prompt || "保持商品主体、颜色、标识与关键细节准确，不添加水印。",
  ].filter(Boolean).join("\n") }];
  inputUrls.forEach((url, index) => {
    const mime = mimeTypes[index] || "";
    if (mime.startsWith("image/")) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    if (mime === "video/mp4") content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    if (mime.startsWith("audio/")) content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
  });
  const requestBody = { model: process.env.ARK_MODEL || "doubao-seedance-2-0-260128", content, generate_audio: input.generateAudio !== false, ratio: input.aspectRatio, duration: input.duration, resolution: input.resolution, watermark: input.promptConfig?.watermark === true };
  const sendArkRequest = async (body, assetTypes, retryReason = "") => {
    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    await logProviderCall(taskId, "ark", "create_video_task", { model: body.model, ratio: body.ratio, duration: body.duration, resolution: body.resolution, watermark: body.watermark, retryReason, promptConfig: input.promptConfig ? { id: input.promptConfig.id, version: input.promptConfig.version, variantKey: input.promptConfig.variantKey } : null, assetTypes }, response.status, payload, response.ok ? null : "ARK_CREATE_FAILED", payload?.id || response.headers.get("x-request-id"));
    return { response, payload };
  };
  let { response, payload } = await sendArkRequest(requestBody, mimeTypes);
  const errorMessage = String(payload?.error?.message || "");
  const privacyCollageContentIndex = content.findIndex((item) => item.type === "image_url" && /(?:隐私结构|动作结构)十二宫格/.test(input.prompt || ""));
  const canDropPrivacyCollage =
    workflowKey === "recreate-video" &&
    privacyCollageContentIndex > 0 &&
    new RegExp(`content\\[${privacyCollageContentIndex}\\].*real person`, "i").test(errorMessage);
  if ((!response.ok || !payload?.id) && canDropPrivacyCollage) {
    const retryContent = content.filter((_, index) => index !== privacyCollageContentIndex);
    const retryBody = { ...requestBody, content: retryContent };
    ({ response, payload } = await sendArkRequest(retryBody, ["dropped_privacy_keyframe_collage", ...mimeTypes.filter((_, index) => index !== privacyCollageContentIndex - 1)], "drop_privacy_keyframe_collage_real_person_rejection"));
  }
  if (!response.ok || !payload?.id) throw new Error(`Ark ${response.status}: ${payload?.error?.message || "task creation failed"}`);
  return payload.id;
}

async function waitForVideo(taskId, generationTaskId) {
  const timeoutMs = Number(process.env.ARK_VIDEO_TIMEOUT_MS || 25 * 60 * 1000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`, { headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}` } });
    const payload = await response.json().catch(() => null);
    await logProviderCall(generationTaskId, "ark", "get_video_task", { providerTaskId: taskId }, response.status, payload, response.ok ? null : "ARK_QUERY_FAILED", taskId);
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

function sophnetImageConfigured() {
  return Boolean(process.env.AI_API_KEY && process.env.AI_MODEL && process.env.AI_BASE_URL);
}

function geminiImageConfigured() {
  return Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY);
}

const supportedGeminiAspectRatios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

function parsedAspectRatio(value) {
  const match = String(value || "").match(/^(\d+):(\d+)$/);
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) return null;
  return { width: Number(match[1]), height: Number(match[2]), value: Number(match[1]) / Number(match[2]) };
}

function nearestGeminiAspectRatio(value) {
  if (supportedGeminiAspectRatios.includes(value)) return value;
  const target = parsedAspectRatio(value);
  if (!target) return "1:1";
  return supportedGeminiAspectRatios.reduce((nearest, candidate) => {
    const candidateValue = parsedAspectRatio(candidate)?.value || 1;
    const nearestValue = parsedAspectRatio(nearest)?.value || 1;
    return Math.abs(Math.log(candidateValue / target.value)) < Math.abs(Math.log(nearestValue / target.value)) ? candidate : nearest;
  }, "1:1");
}

function geminiAspectRatio(value) {
  return nearestGeminiAspectRatio(value);
}

function geminiImageResponseAspectRatio(value) {
  return ({
    "1:1": "ASPECT_RATIO_ONE_BY_ONE",
    "2:3": "ASPECT_RATIO_TWO_BY_THREE",
    "3:2": "ASPECT_RATIO_THREE_BY_TWO",
    "3:4": "ASPECT_RATIO_THREE_BY_FOUR",
    "4:3": "ASPECT_RATIO_FOUR_BY_THREE",
    "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
    "5:4": "ASPECT_RATIO_FIVE_BY_FOUR",
    "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN",
    "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
    "21:9": "ASPECT_RATIO_TWENTY_ONE_BY_NINE",
  })[value] || "ASPECT_RATIO_ONE_BY_ONE";
}

function imageReferencePlan(workflowKey, count, input = {}) {
  return Array.from({ length: count }, (_, index) => {
    if (workflowKey === "model-wear") {
      return index === 0
        ? { label: "模特身份源图", cue: "锁定这位模特的脸型、五官关系、发型、肤色、体型和人体比例；最终图必须保持同一人物身份，不得换脸或换人。" }
        : { label: `穿戴商品源图 ${index}`, cue: "锁定这件服装或商品的品类、版型、结构、颜色、图案、材质和细节；将它自然穿戴到参考图 1 的模特身上，不得换款。" };
    }
    if (workflowKey === "commerce-model") {
      return index === 0
        ? { label: "模特身份参考图", cue: "以图中人物作为身份和外形参考，保留脸型、五官关系、发型、肤色、年龄感与体型；用户要求只改变造型、动作、场景和摄影表达。" }
        : { label: `模特补充参考图 ${index + 1}`, cue: "补充同一人物的角度、体态或造型信息，不得生成另一个人物身份。" };
    }
    if (["hd-enhance", "resize-image"].includes(workflowKey)) {
      return { label: "待处理完整源图", cue: "整张图片都是不可随意重绘的源内容；保留主体身份、构图、文字、颜色、部件和空间关系，只执行当前工作流指定的增强或扩图操作。" };
    }
    if (workflowKey === "white-background") {
      return { label: "商品抠图源图", cue: "精确保留图中商品本体的轮廓、结构、颜色、材质、部件与标识，只移除原背景并生成规范白底和自然轻投影。" };
    }
    if (workflowKey === "recreate-reference-image") {
      const subject = input.scene === "人物多视图" ? "人物身份" : input.scene === "场景多视图" ? "场景空间" : "商品身份";
      return index === 0
        ? { label: `${subject}源图`, cue: `把图中${subject}作为多视图参考板的唯一核心来源，保留可见身份、结构、比例、材质和空间关系。` }
        : { label: `${subject}补充图 ${index + 1}`, cue: `只补充同一${subject}的其他角度和细节，不得引入不同主体。` };
    }
    return index === 0
      ? { label: "商品/主体身份源图", cue: "锁定图中真实商品或核心主体的几何轮廓、比例、部件类型与数量、颜色、材质、Logo 和标识位置；最终图必须是同一款主体，不得替换成同品类常见款。" }
      : { label: `商品/主体补充参考图 ${index + 1}`, cue: "补充同一商品或核心主体的视角、背面、材质、结构或配件关系；不得覆盖参考图 1 的身份，也不得引入另一个款式。" };
  });
}

function imageReferenceDirection(workflowKey, referencePlan) {
  if (!referencePlan.length) return "未提供参考图：严格依据用户描述建立唯一、清晰、结构合理的主体，不自行添加会改变主体身份或核心用途的内容。";
  const numberedRoles = referencePlan.map((item, index) => `参考图 ${index + 1}【${item.label}】：${item.cue}`).join("\n");
  if (workflowKey === "model-wear") {
    return [
      "任务模式：这是多参考图穿搭合成。每张图角色不同，所有参考图都必须被使用。",
      numberedRoles,
      "合成规则：人物身份只来自模特源图，服装/商品身份只来自对应商品源图；不得把模特原穿搭当目标商品，也不得用商品图中的模特替换目标人物。最终穿戴关系、遮挡、褶皱、透视和接触阴影必须自然。",
    ].join("\n");
  }
  if (["hd-enhance", "resize-image", "white-background"].includes(workflowKey)) {
    return [
      "任务模式：这是严格的源图处理任务，不是从零文生图。参考图本身就是待处理内容，必须实际参与生成。",
      numberedRoles,
      "除当前工作流明确要求改变的部分外，其余像素语义和主体身份均应保持；禁止借机换商品、换人物、重做构图或添加新内容。",
    ].join("\n");
  }
  if (workflowKey === "commerce-model") {
    return [
      "任务模式：这是带人物参考的模特再创作任务，不是随机生成人物。",
      numberedRoles,
      "参考人物身份约束优先于通用审美模板；不得生成通用网红脸或与参考图无关的人物。场景、服装和动作可按用户要求调整。",
    ].join("\n");
  }
  if (workflowKey === "recreate-reference-image") {
    return ["任务模式：所有输入图都必须作为多视图参考板的依据。", numberedRoles, "先读取参考图，再生成同一主体或同一场景的互补视角；禁止只根据文字猜测。"].join("\n");
  }
  return [
    "任务模式：这是严格的参考图商品/主体再创作、换景或合成任务，不是忽略图片后从零文生图。每张参考图都必须在最终图片中承担明确作用。",
    numberedRoles,
    "商品/主体身份锁定优先级最高：先逐项观察并锁定整体几何轮廓、长宽厚比例、顶部/正面/侧面结构、部件数量与相对位置、接口/按键位置、颜色、材质、装饰细节、Logo 与标识位置。最终主体必须让人一眼认出就是参考图中的同一款，而不只是同品类。",
    "不得重画成常见品类原型、相似款或另一款主体；禁止改变头部类型、机身形态、部件数量和开合结构。例如双圆形旋转刀头不能变成长柄往复式刀头或三头剃须刀。",
    "如果源图同时出现主设备、保护盖、包装或配件，先区分各对象，不得把保护盖融合成机身、把两个对象拼成新商品，也不得凭空增加部件。",
    "用户文字默认只控制人物、动作、场景、构图、镜头和光线，不得覆盖参考图中的主体身份。源图广告背景和外围宣传文案可以移除；主体本体的结构、按键、Logo 与标识位置应保留。",
    "不要把源图贴入画面或做成画中画。应保持主体身份不变，将同一主体真实地重新拍摄或合成到目标场景，并匹配透视、接触阴影、反射和环境色。",
  ].join("\n");
}

async function generateOne(inputUrls, input, index, workflowKey, generationTaskId) {
  const variation = ["正面居中构图", "轻微侧角构图", "留出营销文案空间", "更强调商品材质细节"][index] || "商业构图";
  const detailStage = ["品牌定位与首屏商品展示长图", "核心卖点解析长图", "材质、结构与工艺细节长图", "真实使用场景与效果长图", "规格、服务与购买理由长图"][index] || "商品详情长图";
  const detailCard = Array.isArray(input.detailCards) ? input.detailCards[index] : null;
  const detailCardDirection = detailCard
    ? `本卡片作用：${detailCard.role}。排版文案主标题：${detailCard.title}。辅助文案：${detailCard.subtitle || "无"}。画面导演要求：${detailCard.visualPrompt}。只生成承载该文案的干净商品画面并预留明确排版空间，不要把主标题、辅助文案或任何文字直接画进图片。`
    : `本卡片阶段：${detailStage}。`;
  const referencePlan = imageReferencePlan(workflowKey, inputUrls.length, input);
  const referenceDirection = imageReferenceDirection(workflowKey, referencePlan);
  const productionDirection = [
    "成片质量：输出一张完整、可直接使用的高质量商业图像，不是草图、分镜、拼贴、九宫格、设计说明或带边框的样机。",
    "主体表现：主体边缘完整清晰，比例可信，关键结构可辨认；材质高光、粗糙度、反射和纹理符合真实物理属性，避免塑料感、融化、变形和重复部件。",
    "构图执行：严格落实用户指定的景别、机位、镜头焦段、主体位置和留白；没有明确指定时，使用稳定的商业构图和清晰视觉层级，避免主体被裁切或被道具遮挡。",
    "光影执行：主光方向统一，环境光、接触阴影、反射与景深自然；主体与场景必须有真实接触关系，避免悬浮、抠图边缘和不一致透视。",
    "内容边界：不要添加无关商品、错误手指/肢体、重复主体、随机文字、价格、二维码、边框或水印。需要保留参考图已有标识时保持位置和形态，不要自行杜撰难以辨认的标识。",
    `输出规格：只生成 1 张最终图片，画幅比例 ${input.aspectRatio || "1:1"}，${input.imageResolution === "2K" ? "目标清晰度 2K" : "目标清晰度 1K"}。`,
    "响应要求：立即执行图像生成，只返回最终图片，不要解释、确认需求、复述提示词或输出纯文字回复。",
  ].join("\n");
  const shared = workflowKey === "image-generate" || workflowKey === "commerce-model"
    ? "按提示词生成原创图像，画面干净完整，不添加文字、水印、价格或无关标识。"
    : workflowKey === "hd-enhance"
    ? "保持原图的主体、构图、比例、颜色、文字和关键细节准确，不新增、不删除或替换任何内容，不添加水印。"
    : workflowKey === "white-background"
    ? "精确抠出商品主体，生成干净纯白电商背景，保留真实材质、边缘、标识与自然轻投影，不添加文字、水印或额外商品。"
    : workflowKey === "resize-image"
    ? "保持原图商品主体、材质、颜色、标识与关键细节完全准确；仅自然延展周边画面以适配目标比例，不裁切主体，不添加文字、水印或额外商品。"
    : ["recreate-product-hero", "recreate-detail-page"].includes(workflowKey)
    ? "参考输入图的构图层级、留白和商业视觉方向，使用同一商品制作原创电商视觉；不得复制原图的文字、品牌、人物或具体画面，不添加水印。"
    : "保持商品主体的形状、颜色、商标和关键细节准确，不改变产品本身，不添加文字、水印或额外商品。";
  const recreateReferencePrompt = workflowKey === "recreate-reference-image" && input.scene === "人物多视图"
    ? [
        "创建一张 16:9 真实摄影棚多机位试衣参考图，像同一位真人模特在白色摄影棚完成一次 fitting 拍摄后整理出的 contact sheet；必须是真人摄影质感，真实皮肤纹理、真实布料、自然站姿、相机透视和棚拍柔光，不能是动漫、插画、手绘、3D 渲染、游戏建模、瓷娃娃、塑料皮肤或概念设定图；不是单张商品图、不是服装图、不是空白九宫格。",
        "第一张输入图如果出现真人、模特、人体轮廓、头发、脸、手臂、腿或穿在人身上的服装，必须把“完整人物”作为唯一主主体来提取和重建；服装只是穿在人物身上的附着物，不得把服装单独当商品。",
        "先提取身份锚点：脸型外轮廓、脸长脸宽比例、下颌线、颧骨位置、额头高度、眼距、眼型大致走向、鼻梁长度、鼻头宽度、嘴型厚度、肤色与年龄感、身材比例、体态、发型轮廓、穿搭关系；不要继承原图背景、光线、拍摄角度或当下表情。",
        "请以输入人物脸部结构和五官相对位置为强参考，生成一位隐私安全的相似虚拟真人模特：脸型、五官比例、发型轮廓、身形比例和姿态气质要接近输入，不要换成通用网红脸、瓷娃娃脸、AI 模特脸、游戏角色脸或完全陌生的漂亮脸。",
        "画面必须在同一张图里包含多个清晰分离的真人模特照片：一个大型完整站姿棚拍全身正面视角、一个背面全身视角、一个侧面全身视角、一个 3/4 角度全身视角、一个上半身近景、一个服装材质/裙摆细节，以及 2-3 张自然头肩近景。不要使用黑色剪影研究、角色设定轮廓稿、建模三视图或游戏资产展示。",
        "脸部/头部近景控制在 2-3 个即可：正面头肩近景、3/4 头肩近景、可选侧面头肩近景；这些近景必须像真实相机拍摄，有皮肤细节、发丝层次、轻微镜头景深和自然光影，不要磨皮过度，不要生成蜡像感。",
        "脸部近景必须互补：部分无遮挡用于保留脸型和五官比例，部分只做很轻的局部隐私遮挡；不要所有脸都遮同一个区域，不要用粗重马赛克或大面积白条破坏真实感。",
        "每个视角都必须是同一位相似虚拟真人模特，保持相同脸型轮廓、眼距鼻型嘴型比例、发型轮廓、身体比例、服装轮廓和姿态气质；每个视角都要清晰分离，不要重叠，不要像拼贴插画。",
        "背景为真实白色或浅灰摄影棚无缝纸，柔和棚拍阴影，画面干净但不要过度留白。禁止输出只有裙子、空心衣服、衣架、平铺服装、无头模特、无脸空白块、空白分格或商品白底图。禁止动漫风、插画风、手绘线稿、角色设定插画、3D 模型渲染、AI 娃娃脸、过度对称五官、塑料皮肤、游戏角色。",
        "不要在生图阶段提前遮挡脸部；生成隐私安全的相似虚拟脸，不逐像素复制真实五官，后续系统只会二次做极轻微模糊，并按不同脸部小图局部遮挡额头、眼睛、鼻口、下巴或脸颊中的某一小部分，五官比例仍可辨认但真实身份不清晰，保留脸型、发型和头部轮廓。",
        `画幅比例${input.aspectRatio}。`,
      ].join("\n")
    : workflowKey === "recreate-reference-image" && input.scene === "场景多视图"
    ? `生成一张场景/背景多视图参考板，参考 environment concept board，不是商品主图。以空间结构、光线方向、背景层次、材质、关键道具、前中远景和可摆放主体区域为核心，不要把画面中的单个商品或人物当成唯一主主体。必须在同一张图中包含：正面空间视角、左侧空间视角、右侧空间视角、纵深/俯视空间视角、近景材质细节、光线氛围小图、可放置模特/商品的留白区域示意。所有视角必须保持同一个场景的色调、材质、空间关系、道具位置和光线逻辑一致，只改变镜头位置、景别和关注点。不要出现清晰真人脸、品牌水印、字幕、箭头、UI 或不可控文字。输出干净、高清、电影级构图的场景参考板。画幅比例${input.aspectRatio}。`
    : workflowKey === "image-generate" || workflowKey === "commerce-model"
    ? `根据用户提示词生成图像，${variation}，画幅比例${input.aspectRatio}。`
    : workflowKey === "recreate-reference-image"
    ? `生成一张商品/物体多视图参考板，不是普通商品主图、不是带模特图、不是场景海报。以用户选择的商品/物体为唯一主主体，保留轮廓、结构、颜色、材质、比例、Logo/标识位置和关键卖点。必须在同一张图中包含：正面、左 45 度、右 45 度、侧面、背面/反面、顶部或底部、材质细节、尺寸比例关系、可选使用方式小图。所有视角必须是同一个商品，品类、颜色、材质、结构和品牌标识位置保持一致，不要凭空换款式、换品类或增加无关配件。如果输入是服装静物且用户选择了商品类型，则输出服装商品多视图；不要补成人物模特。若画面中意外出现真人脸，必须弱化或遮挡，不保留可识别真实身份。不要套用普通商品主图逻辑。画幅比例${input.aspectRatio}。`
    : "";
  const taskPrompt = workflowKey === "model-wear"
    ? `以第一张图片中的模特为主体，将后续图片中的服装或商品自然穿戴到模特身上。保持模特身份、面部、体型和人体结构自然，服装版型、材质、颜色和图案准确。${variation}，画幅比例${input.aspectRatio}。`
    : workflowKey === "recreate-reference-image"
    ? recreateReferencePrompt
    : workflowKey === "hd-enhance"
    ? "智能分析原图后进行高清优化。重点修复压缩噪点、边缘锯齿和模糊细节，保持画面自然，避免过度锐化、塑料感或内容重绘。"
    : workflowKey === "white-background"
    ? "生成规范商品白底图。主体居中、完整可见，边缘干净，背景为均匀纯白。"
    : workflowKey === "resize-image"
    ? `将图片调整为${input.aspectRatio}比例，仅对主体外区域进行真实、连续的扩展。`
    : workflowKey === "recreate-product-hero"
    ? `基于参考图生成原创商品首屏主图，${variation}，画幅比例${input.aspectRatio}。`
    : workflowKey === "recreate-detail-page"
    ? `生成原创商品详情页卡片。${detailCardDirection}各张图表达不同卖点，画幅比例${input.aspectRatio}，不生成文字、水印或价格。`
    : workflowKey === "product-detail-page"
    ? `生成商品详情页独立卡片。${detailCardDirection}同一任务的各张图必须围绕不同商品特性表达，不得重复构图或重复卖点；从输入商品中识别可见的材质、结构、用途和适用人群。${variation}，竖向画幅比例${input.aspectRatio}。画面内不要生成文字、价格、标签或水印。`
    : workflowKey === "scene-image"
    ? `根据商品与用户描述自动导演真实使用场景，${variation}，画幅比例${input.aspectRatio}，场景光线与商品接触阴影自然，突出商品主体。`
    : `生成电商商品主图，${variation}，画幅比例${input.aspectRatio}，真实摄影，干净背景，柔和自然阴影。`;
  const prompt = [
    `任务：根据以下完整导演指令生成最终图片。执行优先级为：${inputUrls.length ? "参考图角色与不可变内容 > 用户对场景与表达的明确要求 > 工作流任务要求 > 自动补充的质量规则" : "用户明确要求 > 工作流任务要求 > 自动补充的质量规则"}；发生冲突时服从优先级更高的要求。`,
    referenceDirection,
    workflowKey === "recreate-reference-image" ? "" : shared,
    workflowKey === "recreate-reference-image" || !input.internalPrompt ? "" : `工作流内置策略：${input.internalPrompt}`,
    `工作流任务要求：${taskPrompt}`,
    input.prompt ? `用户创作要求（必须逐项落实）：\n${input.prompt}` : "",
    productionDirection,
  ].filter(Boolean).join("\n");
  if (workflowKey === "recreate-reference-image") {
    if (geminiImageConfigured()) {
      return createGeminiImageWithSophnetFallback(inputUrls, prompt, generationTaskId, index, input.aspectRatio, input, referencePlan);
    }
    return createSophnetImage(inputUrls, prompt, generationTaskId, index, input, referencePlan);
  }
  if (workflowKey === "image-generate" || workflowKey === "commerce-model") {
    if (input.imageProvider === "sophnet") {
      if (!sophnetImageConfigured()) throw new Error("SophNet image generation is not configured");
      return createSophnetImage(inputUrls, prompt, generationTaskId, index, input, referencePlan);
    }
    if (!geminiImageConfigured()) throw new Error("Gemini image generation is not configured");
    return createGeminiImage(inputUrls, prompt, generationTaskId, index, geminiAspectRatio(input.aspectRatio), referencePlan);
  }
  if (input.imageProvider === "gemini") {
    if (!geminiImageConfigured()) throw new Error("Gemini image generation is not configured");
    return createGeminiImage(inputUrls, prompt, generationTaskId, index, geminiAspectRatio(input.aspectRatio), referencePlan);
  }
  if (input.imageProvider === "sophnet") {
    if (!sophnetImageConfigured()) throw new Error("SophNet image generation is not configured");
    return createSophnetImage(inputUrls, prompt, generationTaskId, index, input, referencePlan);
  }
  if (!sophnetImageConfigured() && geminiImageConfigured()) {
    return createGeminiImage(inputUrls, prompt, generationTaskId, index, geminiAspectRatio(input.aspectRatio), referencePlan);
  }
  return createSophnetImage(inputUrls, prompt, generationTaskId, index, input, referencePlan);
}

async function generateImageOutputs(inputUrls, input, workflowKey, generationTaskId) {
  const count = Math.max(1, Number(input.outputs) || 1);
  const outputs = new Array(count);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < count) {
      const index = nextIndex++;
      outputs[index] = await generateOne(inputUrls, input, index, workflowKey, generationTaskId);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, count) }, run));
  return outputs;
}

async function referenceImageAspectRatio(inputUrls) {
  if (!inputUrls.length) return null;
  try {
    const response = await fetch(inputUrls[0]);
    if (!response.ok) return null;
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    return metadata.width && metadata.height ? `${metadata.width}:${metadata.height}` : null;
  } catch {
    return null;
  }
}

function targetImageDimensions(aspectRatio, resolution = "1K") {
  const ratio = parsedAspectRatio(aspectRatio);
  if (!ratio) return null;
  const longEdge = resolution === "2K" ? 2048 : 1024;
  const scale = Math.max(1, Math.floor(longEdge / Math.max(ratio.width, ratio.height)));
  if (ratio.width <= longEdge && ratio.height <= longEdge) return { width: ratio.width * scale, height: ratio.height * scale };
  if (ratio.value >= 1) return { width: longEdge, height: Math.max(1, Math.round(longEdge / ratio.value)) };
  return { width: Math.max(1, Math.round(longEdge * ratio.value)), height: longEdge };
}

async function conformImageToAspectRatio(buffer, requestedRatio, resolution) {
  const dimensions = targetImageDimensions(requestedRatio, resolution);
  if (!dimensions) return { buffer, dimensions: null, transformed: false };
  const metadata = await sharp(buffer).metadata();
  if (metadata.width === dimensions.width && metadata.height === dimensions.height) return { buffer, dimensions, transformed: false };
  const background = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, { fit: "cover" })
    .blur(28)
    .modulate({ brightness: 0.86, saturation: 0.82 })
    .toBuffer();
  const foreground = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, { fit: "contain", withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const output = await sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .png({ compressionLevel: 8 })
    .toBuffer();
  return { buffer: output, dimensions, transformed: true };
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

async function settleSuccess(task, savedAssets) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT status FROM generation_tasks WHERE id = $1 FOR UPDATE", [task.id]);
    if (!["QUEUED", "RUNNING"].includes(current.rows[0]?.status)) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      "UPDATE generation_tasks SET status = 'SUCCEEDED', output_json = $2::jsonb, error_code = NULL, updated_at = NOW() WHERE id = $1",
      [task.id, JSON.stringify({ assets: savedAssets })],
    );
    const adminExempt = task.input_json?.billingMode === "ADMIN_EXEMPT";
    if (!adminExempt) {
      const wallet = await client.query("SELECT available_points, frozen_points FROM wallets WHERE user_id = $1 FOR UPDATE", [task.user_id]);
      if (!wallet.rows[0] || Number(wallet.rows[0].frozen_points) < task.points) throw new Error(`Insufficient frozen points for task ${task.id}`);
      await client.query("UPDATE wallets SET frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [task.user_id, task.points]);
      await client.query(
        `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
         VALUES ($1, 'SETTLE', 0, $2, 'GENERATION_TASK', $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [task.user_id, wallet.rows[0].available_points, task.id, `settle:${task.id}`],
      );
    }
    if (task.email && process.env.EMAIL_NOTIFY_TASK_SUCCEEDED === "true") {
      const html = `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2><p>任务 <strong>${task.id}</strong>（${task.workflow_key}）已生成，可以下载。</p><p><a href="${process.env.PUBLIC_APP_URL || "https://aigc.bigapple.store"}/tasks/${task.id}">查看任务详情</a></p></div>`;
      await client.query(
        `INSERT INTO notification_outbox (user_id, recipient, event_type, subject, html_body, idempotency_key)
         VALUES ($1, $2, 'TASK_COMPLETED', '你的创作任务已完成', $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [task.user_id, task.email, html, `task_completed:${task.id}`],
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
      "SELECT t.id, t.user_id, t.workflow_key, t.points, t.status, t.input_json, u.email FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE OF t",
      [taskId],
    );
    const task = result.rows[0];
    if (!task || ["SUCCEEDED", "FAILED", "REJECTED", "CANCELED"].includes(task.status)) {
      await client.query("ROLLBACK");
      return;
    }
    const adminExempt = task.input_json?.billingMode === "ADMIN_EXEMPT";
    const wallet = await client.query("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [task.user_id]);
    const balance = wallet.rows[0].available_points;
    await client.query("UPDATE generation_tasks SET status = 'FAILED', error_code = $2, updated_at = NOW() WHERE id = $1", [task.id, message.slice(0, 200)]);
    if (!adminExempt) {
      await client.query(
        "UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1",
        [task.user_id, task.points],
      );
      await client.query(
        `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
         VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
        [task.user_id, task.points, balance + task.points, task.id, `refund:${task.id}`],
      );
    }
    if (task.email) {
      const html = `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2><p>任务 <strong>${task.id}</strong> 执行失败，${adminExempt ? "本任务为管理员免积分任务，未产生积分变动" : `${task.points} 积分已自动退回`}。</p><p><a href="${process.env.PUBLIC_APP_URL || "https://aigc.bigapple.store"}/tasks/${task.id}">查看任务详情</a></p></div>`;
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
  // The longest provider poll is configurable. A grace period avoids
  // reclaiming normal work while returning reservations stranded by a crash.
  const staleAfterMinutes = Math.max(45, Math.ceil(Number(process.env.ARK_VIDEO_TIMEOUT_MS || 25 * 60 * 1000) / 60_000) + 15);
  const stale = await pool.query(
    `SELECT id FROM generation_tasks
     WHERE status IN ('QUEUED', 'RUNNING')
       AND updated_at < NOW() - ($1::int * INTERVAL '1 minute')
     ORDER BY updated_at ASC
     LIMIT 100`,
    [staleAfterMinutes],
  );
  for (const task of stale.rows) {
    await settleFailure(task.id, "TASK_TIMEOUT");
    console.warn(`reclaimed stale task ${task.id}`);
  }
}

const worker = new Worker("generation", async (job) => {
  const taskResult = await pool.query("SELECT t.id, t.user_id, t.workflow_key, t.points, t.input_json, t.request_id, u.email FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE t.id = $1", [job.data.taskId]);
  const task = taskResult.rows[0];
  if (!task) throw new Error("Task not found");
  log("info", "task_started", { requestId: task.request_id, taskId: task.id, userId: task.user_id, workflowKey: task.workflow_key });
  const claimed = await pool.query("UPDATE generation_tasks SET status = 'RUNNING', updated_at = NOW() WHERE id = $1 AND status IN ('QUEUED', 'RUNNING') RETURNING id", [task.id]);
  if (!claimed.rowCount) return { skipped: true };
  const savedKeys = [];
  let temporaryKeys = [];
  try {
    const acceptanceFault = task.workflow_key === "product-hero-image" && task.email?.toLowerCase() === process.env.ACCEPTANCE_USER_EMAIL?.toLowerCase()
      ? task.input_json.acceptanceFault
      : null;
    if (acceptanceFault === "PROVIDER_FAILURE") {
      await logProviderCall(task.id, "sophnet", "generate_image", { controlledAcceptanceFault: true }, 502, {}, "SOPHNET_CONTROLLED_FAILURE");
      throw new Error("SOPHNET_PROVIDER_FAILED");
    }
    if (acceptanceFault === "PROVIDER_TIMEOUT") {
      await logProviderCall(task.id, "sophnet", "generate_image", { controlledAcceptanceFault: true }, 504, {}, "SOPHNET_CONTROLLED_TIMEOUT");
      throw new Error("SOPHNET_PROVIDER_TIMEOUT");
    }
    const storageKeys = task.input_json.storageKeys || [task.input_json.storageKey];
    const inputUrls = await Promise.all(storageKeys.map((key) => cosUrl(key, "GET", 3600)));
    if (task.input_json.aspectRatioMode === "auto") {
      task.input_json.aspectRatio = await referenceImageAspectRatio(inputUrls) || "1:1";
    }
    const temporaryOutputs = task.workflow_key === "video-mix"
      ? [await generateMix(inputUrls, task.input_json, task)]
      : ["product-ad-video", "recreate-video", "seedance-video", "model-spokesperson-video"].includes(task.workflow_key)
      ? [{ url: await generateVideo(inputUrls, task.input_json, task.workflow_key, task.id), temporaryKey: null }]
      : await generateImageOutputs(inputUrls, task.input_json, task.workflow_key, task.id);
    temporaryKeys = temporaryOutputs.flatMap((output) => output.temporaryKey ? [output.temporaryKey] : []);
    const savedAssets = [];
    for (const [index, output] of temporaryOutputs.entries()) {
      const response = await fetch(output.url);
      if (!response.ok) throw new Error(`Could not download provider output ${response.status}`);
      let buffer = Buffer.from(await response.arrayBuffer());
      const isVideoTask = ["product-ad-video", "recreate-video", "seedance-video", "model-spokesperson-video", "video-mix"].includes(task.workflow_key);
      const provider = output.provider || (isVideoTask ? "ark" : "sophnet");
      const model = output.model || (isVideoTask ? (process.env.ARK_MODEL || "doubao-seedance-2-0-260128") : process.env.AI_MODEL);
      let contentType = response.headers.get("content-type")?.split(";")[0] || (isVideoTask ? "video/mp4" : "image/png");
      let outputDimensions = null;
      let aspectRatioTransformed = false;
      if (!isVideoTask && task.input_json.aspectRatio) {
        const conformed = await conformImageToAspectRatio(buffer, task.input_json.aspectRatio, task.input_json.imageResolution);
        buffer = conformed.buffer;
        outputDimensions = conformed.dimensions;
        aspectRatioTransformed = conformed.transformed;
        if (aspectRatioTransformed) contentType = "image/png";
        await logProviderCall(task.id, "image-postprocess", "conform_aspect_ratio", { requestedAspectRatio: task.input_json.requestedAspectRatio, normalizedAspectRatio: task.input_json.aspectRatio, providerAspectRatio: nearestGeminiAspectRatio(task.input_json.aspectRatio), outputDimensions }, 200, { transformed: aspectRatioTransformed });
      }
      const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : contentType === "video/webm" ? "webm" : contentType.startsWith("video/") ? "mp4" : "png";
      const key = `users/${task.user_id}/outputs/${task.id}/${index + 1}-${randomUUID()}.${extension}`;
      await putObject(key, buffer, contentType);
      savedKeys.push(key);
      const auditStatus = contentReviewEnabled ? "PENDING_REVIEW" : "READY";
      const generatedAt = new Date();
      const expiresAt = new Date(generatedAt.getTime() + Number(process.env.TEMP_OUTPUT_RETENTION_HOURS || 48) * 60 * 60 * 1000);
      const detailCard = Array.isArray(task.input_json.detailCards) ? task.input_json.detailCards[index] : null;
      const asset = await pool.query(
        `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name, metadata_json)
         VALUES ($1, 'OUTPUT', $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
        [task.user_id, key, contentType, buffer.length, auditStatus, detailCard?.title ? `${String(detailCard.title).slice(0, 40)}.${extension}` : `${task.workflow_key}-${index + 1}.${extension}`, JSON.stringify({ taskId: task.id, workflowKey: task.workflow_key, ...(detailCard ? { detailPageCard: detailCard } : {}), provider, model, aiGenerated: true, aiContentLabel: "AI_GENERATED", imageAspectRatio: { mode: task.input_json.aspectRatioMode || "preset", requested: task.input_json.requestedAspectRatio || task.input_json.aspectRatio, normalized: task.input_json.aspectRatio, provider: nearestGeminiAspectRatio(task.input_json.aspectRatio), outputDimensions, transformed: aspectRatioTransformed }, provenance: { generatedAt: generatedAt.toISOString(), workerId }, library: { saved: false, retention: "TEMPORARY_OUTPUT", expiresAt: expiresAt.toISOString() }, moderation: { status: contentReviewEnabled ? "PENDING_REVIEW" : "BYPASSED" } })],
      );
      savedAssets.push({ assetId: asset.rows[0].id, storageKey: key });
    }
    const settled = contentReviewEnabled ? await submitForReview(task, savedAssets) : await settleSuccess(task, savedAssets);
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
  const suppressedRecipients = new Set(
    [process.env.ACCEPTANCE_ADMIN_EMAIL, process.env.ACCEPTANCE_USER_EMAIL, process.env.NOTIFICATION_SUPPRESSED_RECIPIENTS]
      .flatMap((value) => (value || "").split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const message of messages) {
    if (suppressedRecipients.has(message.recipient.trim().toLowerCase())) {
      await pool.query("UPDATE notification_outbox SET status = 'SUPPRESSED', sent_at = NULL, last_error = NULL, updated_at = NOW() WHERE id = $1", [message.id]);
      log("info", "notification_suppressed", { notificationId: message.id, recipientType: "acceptance" });
      continue;
    }
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
