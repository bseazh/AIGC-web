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
  const points = [0.12, 0.32, 0.52, 0.72, 0.9].map((ratio) =>
    Math.round(Math.max(0, durationSeconds * ratio) * 10) / 10,
  );
  return [...new Set(points)].slice(0, 5);
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
    "replacementPlan 每项包含：target、replaceable、strategy、promptInstruction。",
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
        replaceable: true,
        strategy: "参考主体出现位置、展示节奏和景别，用用户商品重生成。",
        promptInstruction: "将参考视频中的主要售卖主体替换为用户上传商品，保持商品外观准确。",
      },
      {
        target: "模特",
        replaceable: true,
        strategy: "只参考动作和站位，不复制原人物脸和服装。",
        promptInstruction: "如用户提供模特参考图或模特信息，生成新的模特形象并保持动作结构。",
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
}) {
  const directory = await mkdtemp(join(tmpdir(), "aigc-recreate-analysis-"));
  const sourcePath = join(directory, "source.mp4");
  const uploadedKeys: string[] = [];
  try {
    await downloadObjectToFile(cache.storage_key, sourcePath);
    const durationSeconds = Number(cache.duration_seconds);
    const seconds = keyframeSeconds(durationSeconds);
    const frames: Frame[] = [];
    for (const second of seconds) {
      const outputPath = join(directory, `frame-${String(second).replace(".", "-")}.jpg`);
      await execute(
        ffmpegPath,
        [
          "-y",
          "-ss",
          String(second),
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
        time: second,
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
          frameExtractedAt: new Date().toISOString(),
        }),
      ],
    );
    return { frames, durationSeconds };
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
    const { frames, durationSeconds } = await extractFrames(cache);
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
