import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createSignedObjectUrl, downloadObjectToFile, removeObject, uploadLocalObject } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

const execute = promisify(execFile);
const ffmpegPath =
  process.env.FFMPEG_PATH ||
  (process.platform === "darwin" ? "ffmpeg" : "/usr/bin/ffmpeg");

type Frame = {
  time: number;
  storageKey: string;
  url: string;
};

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function keyframeSeconds(durationSeconds: number) {
  const frameCount = durationSeconds >= 12 ? 12 : durationSeconds >= 8 ? 9 : 8;
  const points = Array.from({ length: frameCount }, (_, index) => {
    const ratio = (index + 0.5) / frameCount;
    return Math.round(Math.max(0, durationSeconds * ratio) * 10) / 10;
  });
  return [...new Set(points)].slice(0, frameCount);
}

function numericRange(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function analysisPrompt(options: Record<string, unknown>) {
  const replacementGoals = Array.isArray(options.replacementGoals)
    ? options.replacementGoals.filter((item) => typeof item === "string").join("、")
    : "换商品、换模特、换背景的可能性";
  return [
    "你是电商短视频复刻工作台的视觉分析助手。请阅读多张关键帧，输出严格 JSON，不要输出 Markdown。",
    "目标：识别对标视频中哪些内容适合替换，哪些只能作为节奏/镜头参考，并生成可用于视频生成模型的中文提示词。",
    `用户关注的替换方向：${replacementGoals || "换商品、换模特、换背景的可能性"}。`,
    "JSON 结构必须包含：summary、frames、replacementPlan、risks、prompt。",
    "frames 每项包含：time、scene、shotType、cameraMovement、mainSubjects、people、background、textAndLogo、replaceableParts、riskNotes。",
    "replacementPlan 是给用户看的“近似替换槽位清单”，最多 5 项，只保留最明显、最有商业价值、用户最容易上传素材替换的对象；不要列出零碎小物件。",
    "replacementPlan 每项包含：target、slotType、materialKind、replaceable、priority、confidence、sourceFrameTimes、strategy、promptInstruction、detectionNote。",
    "slotType 只能是 product、person、scene、text、style 之一；priority 为 1-5，1 最优先；confidence 为 0-1。",
    "materialKind 用一句中文告诉用户该上传什么，例如：商品图、模特参考图、场景参考图、品牌/卖点文字。",
    "如果画面里物品太多，请合并成“桌面小道具/背景陈列”等低优先级槽位；只把主商品、核心人物、主要场景放在前面。",
    "detectionNote 用一句中文说明这是基于关键帧的近似识别，不要假装知道不可见区域。",
    "要求：不得建议复制原人物脸、原商品、品牌、Logo、水印或字幕；要强调重生成原创视频，而不是像素级硬贴。",
  ].join("\n");
}

function fallbackAnalysis(frames: Frame[], durationSeconds: number) {
  return {
    summary: "已抽取关键帧；视觉模型未配置时，仅提供基础时间点建议。",
    frames: frames.map((frame) => ({
      time: frame.time,
      scene: "待视觉模型识别",
      shotType: "待识别",
      cameraMovement: "待识别",
      mainSubjects: [],
      people: [],
      background: { description: "待识别", replaceable: true, referenceOnly: true },
      textAndLogo: { hasSubtitle: null, hasWatermark: null, action: "不要复刻字幕、水印、Logo" },
      replaceableParts: ["商品", "模特", "背景"],
      riskNotes: ["需要配置 SophNet Chat 视觉模型后获得准确识别结果"],
    })),
    replacementPlan: [
      {
        target: "商品",
        slotType: "product",
        materialKind: "商品图或主体参考图",
        replaceable: true,
        priority: 1,
        confidence: 0.55,
        sourceFrameTimes: frames.slice(0, 3).map((frame) => frame.time),
        strategy: "参考主体出现位置、展示节奏和景别，用用户商品重生成。",
        promptInstruction: "将参考视频中的主要售卖主体替换为用户上传商品，保持商品外观准确。",
        detectionNote: "未接入视觉模型时仅按常见带货视频结构做近似建议。",
      },
      {
        target: "模特",
        slotType: "person",
        materialKind: "模特参考图或人物设定",
        replaceable: true,
        priority: 2,
        confidence: 0.45,
        sourceFrameTimes: frames.slice(0, 3).map((frame) => frame.time),
        strategy: "只参考动作和站位，不复制原人物脸和服装。",
        promptInstruction: "如用户提供模特参考图或模特信息，生成新的模特形象并保持动作结构。",
        detectionNote: "未接入视觉模型时无法确认人物是否出镜，建议按需上传。",
      },
    ],
    risks: ["未接入视觉模型时无法判断遮挡、字幕、水印和具体替换区域。"],
    prompt: `参考对标视频 ${durationSeconds.toFixed(1)} 秒内的镜头节奏、景别变化和主体展示方式，使用用户素材重生成原创视频。不得复制原商品、人物脸、品牌、字幕、Logo 或水印。`,
  };
}

async function extractFrames(cache: {
  id: string;
  storage_key: string;
  duration_seconds: string;
  metadata_json: Record<string, unknown>;
  user_id: string;
}, options: { startSeconds?: number; durationSeconds?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "aigc-recreate-analysis-"));
  const sourcePath = join(directory, "source.mp4");
  const uploadedKeys: string[] = [];
  try {
    await downloadObjectToFile(cache.storage_key, sourcePath);
    const sourceDurationSeconds = Number(cache.duration_seconds);
    const startSeconds = numericRange(options.startSeconds, 0, 0, Math.max(0, sourceDurationSeconds - 0.1));
    const availableDurationSeconds = Math.max(0.3, sourceDurationSeconds - startSeconds);
    const requestedDurationSeconds = numericRange(
      options.durationSeconds,
      Math.max(3, availableDurationSeconds),
      3,
      availableDurationSeconds,
    );
    const durationSeconds = Math.min(requestedDurationSeconds, availableDurationSeconds);
    const seconds = keyframeSeconds(durationSeconds);
    const frames: Frame[] = [];
    for (const second of seconds) {
      const sourceSecond = Math.round((startSeconds + second) * 10) / 10;
      const outputPath = join(directory, `frame-${String(second).replace(".", "-")}.jpg`);
      await execute(
        ffmpegPath,
        [
          "-y",
          "-ss",
          String(sourceSecond),
          "-i",
          sourcePath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          outputPath,
        ],
        { timeout: 20_000, maxBuffer: 1024 * 1024 },
      );
      const storageKey = `users/${cache.user_id}/temporary/douyin/${cache.id}/frames/${randomUUID()}.jpg`;
      await uploadLocalObject(storageKey, outputPath, "image/jpeg");
      uploadedKeys.push(storageKey);
      frames.push({
        time: sourceSecond,
        storageKey,
        url: await createSignedObjectUrl(storageKey, "GET", 3600),
      });
    }
    await db.query(
      `UPDATE douyin_video_caches
       SET metadata_json = metadata_json || $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [
        cache.id,
        JSON.stringify({
          frameStorageKeys: [
            ...(
              Array.isArray(cache.metadata_json?.frameStorageKeys)
                ? cache.metadata_json.frameStorageKeys.filter((item) => typeof item === "string")
                : []
            ),
            ...uploadedKeys,
          ],
          keyframeSeconds: seconds,
          keyframeSourceStartSeconds: startSeconds,
          keyframeSourceDurationSeconds: durationSeconds,
          frameExtractedAt: new Date().toISOString(),
        }),
      ],
    );
    return { frames, durationSeconds, startSeconds };
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => removeObject(key).catch(() => undefined)));
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function callSophnetVision(frames: Frame[], options: Record<string, unknown>) {
  const apiKey =
    process.env.SOPHNET_CHAT_API_KEY ||
    process.env.SOPHNET_VISION_API_KEY ||
    process.env.AI_API_KEY;
  const baseUrl = process.env.SOPHNET_CHAT_BASE_URL || "https://www.sophnet.com/api/open-apis/v1";
  const model = process.env.SOPHNET_CHAT_MODEL || "doubao-seed-2-0-mini-260428";
  if (!apiKey) return null;
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: analysisPrompt(options) },
    ...frames.flatMap((frame) => [
      { type: "text", text: `关键帧时间：${frame.time.toFixed(1)} 秒` },
      { type: "image_url", image_url: { url: frame.url } },
    ]),
  ];
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => null);
  await db.query(
    `INSERT INTO provider_call_logs (provider, operation, request_json, response_status, response_json, error_code, provider_request_id)
     VALUES ('sophnet-chat', 'recreate_video_frame_analysis', $1::jsonb, $2, $3::jsonb, $4, $5)`,
    [
      JSON.stringify({ model, frameCount: frames.length }),
      response.status,
      JSON.stringify(payload || {}),
      response.ok ? null : "SOPHNET_CHAT_HTTP_ERROR",
      payload?.id || response.headers.get("x-request-id"),
    ],
  );
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error?.message || `SophNet Chat HTTP ${response.status}`);
  }
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("SophNet Chat did not return text content");
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function callSophnetPromptPolish(cache: {
  id: string;
  metadata_json: Record<string, unknown>;
}, options: Record<string, unknown>) {
  const apiKey =
    process.env.SOPHNET_CHAT_API_KEY ||
    process.env.SOPHNET_VISION_API_KEY ||
    process.env.AI_API_KEY;
  const baseUrl = process.env.SOPHNET_CHAT_BASE_URL || "https://www.sophnet.com/api/open-apis/v1";
  const model = process.env.SOPHNET_CHAT_MODEL || "doubao-seed-2-0-mini-260428";
  if (!apiKey) return null;
  const userCommand = typeof options.userCommand === "string" ? options.userCommand.trim() : "";
  const materialCount = Number(options.materialCount) || 0;
  const frameAnalysis = cache.metadata_json?.frameAnalysis || null;
  const text = [
    "你是电商短视频复刻工作台的提示词导演。请把用户口语化复刻要求整理成视频生成模型可执行的中文方案，输出严格 JSON，不要 Markdown。",
    "JSON 结构必须包含：summary、preserve、replace、materialUse、avoid、finalPrompt。",
    "summary 是一句给用户看的复刻方案摘要。",
    "preserve、replace、materialUse、avoid 均为中文字符串数组。",
    "finalPrompt 是给视频生成模型的完整中文提示词。",
    "原则：保留对标视频的镜头节奏、构图、动作走势、光线氛围；用用户上传素材和复刻口令做通配替换；匹配不上的素材不要强行使用。",
    "禁止要求复制原视频人物脸、原商品、原品牌、Logo、水印或原字幕。",
    `用户复刻口令：${userCommand || "用户未填写；请生成一个默认通配复刻方案。"}`,
    `用户上传素材数量：${materialCount}`,
    `关键帧视觉分析：${JSON.stringify(frameAnalysis).slice(0, 5000)}`,
  ].join("\n");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: text }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => null);
  await db.query(
    `INSERT INTO provider_call_logs (provider, operation, request_json, response_status, response_json, error_code, provider_request_id)
     VALUES ('sophnet-chat', 'recreate_video_prompt_polish', $1::jsonb, $2, $3::jsonb, $4, $5)`,
    [
      JSON.stringify({ model, materialCount, hasFrameAnalysis: Boolean(frameAnalysis), userCommandLength: userCommand.length }),
      response.status,
      JSON.stringify(payload || {}),
      response.ok ? null : "SOPHNET_CHAT_HTTP_ERROR",
      payload?.id || response.headers.get("x-request-id"),
    ],
  );
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error?.message || `SophNet Chat HTTP ${response.status}`);
  }
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("SophNet Chat did not return text content");
  try {
    return JSON.parse(raw);
  } catch {
    return { finalPrompt: raw };
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !validUuid(body.cacheId)) {
    return NextResponse.json({ code: "INVALID_CACHE", message: "请先获取并缓存对标视频" }, { status: 400 });
  }
  const cacheResult = await db.query<{
    id: string;
    user_id: string;
    storage_key: string;
    duration_seconds: string;
    metadata_json: Record<string, unknown>;
    title: string;
  }>(
    `SELECT id, user_id, storage_key, duration_seconds, metadata_json, title
     FROM douyin_video_caches
     WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE' AND expires_at > NOW()`,
    [body.cacheId, user.id],
  );
  const cache = cacheResult.rows[0];
  if (!cache) {
    return NextResponse.json({ code: "CACHE_EXPIRED", message: "对标视频缓存已过期，请重新获取视频" }, { status: 410 });
  }
  try {
    if (body.mode === "polish") {
      const polished = await callSophnetPromptPolish(cache, body).catch((error) => ({
        summary: "已按复刻口令生成基础方案；视觉模型润色暂时不可用。",
        preserve: ["镜头节奏", "构图", "动作走势", "光线氛围"],
        replace: ["按用户口令和上传素材做通配替换"],
        materialUse: ["能匹配上的素材优先使用，匹配不上的素材不强行使用"],
        avoid: ["原人物脸", "原商品", "原品牌", "Logo", "水印", "原字幕"],
        finalPrompt: `参考对标视频的镜头节奏、构图、动作走势和光线氛围，${typeof body.userCommand === "string" && body.userCommand.trim() ? body.userCommand.trim() : "使用用户上传素材做通配替换"}。能匹配上的素材优先用于人物、服装、商品、背景或字幕替换；匹配不上的素材不要强行使用。生成原创短视频，不复制原人物脸、原商品、品牌、Logo、水印或原字幕。`,
        providerError: error instanceof Error ? error.message.slice(0, 300) : "SophNet Chat prompt polish failed",
      }));
      await db.query(
        `UPDATE douyin_video_caches
         SET metadata_json = metadata_json || $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [cache.id, JSON.stringify({ polishedRecreatePrompt: polished, promptPolishedAt: new Date().toISOString() })],
      );
      return NextResponse.json({
        polished,
        providerConfigured: Boolean(process.env.SOPHNET_CHAT_API_KEY || process.env.SOPHNET_VISION_API_KEY || process.env.AI_API_KEY),
      });
    }
    const startSeconds = numericRange(body.startSeconds, 0, 0, Math.max(0, Number(cache.duration_seconds) - 0.1));
    const requestedDurationSeconds = numericRange(
      body.durationSeconds,
      Number(cache.duration_seconds),
      3,
      Number(cache.duration_seconds),
    );
    const { frames, durationSeconds } = await extractFrames(cache, {
      startSeconds,
      durationSeconds: requestedDurationSeconds,
    });
    if (body.mode === "frames") {
      return NextResponse.json({
        frames,
        analysis: null,
        providerConfigured: Boolean(process.env.SOPHNET_CHAT_API_KEY || process.env.SOPHNET_VISION_API_KEY || process.env.AI_API_KEY),
      });
    }
    const aiAnalysis = await callSophnetVision(frames, body).catch((error) => ({
      ...fallbackAnalysis(frames, durationSeconds),
      providerError: error instanceof Error ? error.message.slice(0, 300) : "SophNet Chat analysis failed",
    }));
    const analysis = aiAnalysis || fallbackAnalysis(frames, durationSeconds);
    await db.query(
      `UPDATE douyin_video_caches
       SET metadata_json = metadata_json || $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [cache.id, JSON.stringify({ frameAnalysis: analysis, frameAnalyzedAt: new Date().toISOString() })],
    );
    return NextResponse.json({ frames, analysis, providerConfigured: Boolean(process.env.SOPHNET_CHAT_API_KEY || process.env.SOPHNET_VISION_API_KEY || process.env.AI_API_KEY) });
  } catch (error) {
    console.error("recreate video analysis failed", error);
    return NextResponse.json(
      { code: "FRAME_ANALYSIS_FAILED", message: error instanceof Error ? error.message : "关键帧识别失败" },
      { status: 500 },
    );
  }
}
