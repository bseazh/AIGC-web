import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

function normalizeRegion(region: unknown) {
  if (!region || typeof region !== "object") return null;
  const raw = region as Record<string, unknown>;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0.02, Math.min(1, width)),
    height: Math.max(0.02, Math.min(1, height)),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    view: typeof raw.view === "string" ? raw.view.slice(0, 30) : "",
  };
}

async function callSophnetFaceVision(imageUrl: string, originalName: string | null) {
  const apiKey =
    process.env.SOPHNET_CHAT_API_KEY ||
    process.env.SOPHNET_VISION_API_KEY ||
    process.env.AI_API_KEY;
  const baseUrl = process.env.SOPHNET_CHAT_BASE_URL || "https://www.sophnet.com/api/open-apis/v1";
  const model = process.env.SOPHNET_CHAT_MODEL || "doubao-seed-2-0-mini-260428";
  if (!apiKey) return null;
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: [
        "你是多视图人像参考图的人脸定位器。请识别图片中所有可能包含真实人脸/正脸/侧脸/半张脸的区域。",
        "只输出严格 JSON，不要 Markdown。",
        "JSON 字段：faceRegions、summary。",
        "faceRegions 是数组，每项包含 x、y、width、height、confidence、view。",
        "x、y、width、height 必须是相对整张图片的 0-1 归一化坐标，只框住脸部上半区域或眼鼻附近区域，不要框住完整脸、下巴、头发或完整身体。",
        "多视图参考板里每个小格的人脸都要尽量标出；侧脸、远景小脸、局部露眼也要标出。",
        "如果无法确定，返回空数组。",
        `文件名：${originalName || "未命名素材"}`,
      ].join("\n"),
    },
    { type: "image_url", image_url: { url: imageUrl } },
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
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => null);
  await db.query(
    `INSERT INTO provider_call_logs (provider, operation, request_json, response_status, response_json, error_code, provider_request_id)
     VALUES ('sophnet-chat', 'recreate_face_mask_analysis', $1::jsonb, $2, $3::jsonb, $4, $5)`,
    [
      JSON.stringify({ model, originalName }),
      response.status,
      JSON.stringify(payload || {}),
      response.ok ? null : "SOPHNET_CHAT_HTTP_ERROR",
      payload?.id || response.headers.get("x-request-id"),
    ],
  );
  if (!response.ok) throw new Error(payload?.message || payload?.error?.message || `SophNet Chat HTTP ${response.status}`);
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("SophNet Chat did not return text content");
  return JSON.parse(raw);
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.assetId !== "string")
    return NextResponse.json({ code: "INVALID_ASSET", message: "请先生成或上传人物多视图参考" }, { status: 400 });
  const result = await db.query<{
    id: string;
    storage_key: string;
    mime_type: string;
    original_name: string | null;
  }>(
    "SELECT id, storage_key, mime_type, original_name FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'READY'",
    [body.assetId, user.id],
  );
  const asset = result.rows[0];
  if (!asset || !asset.mime_type.startsWith("image/"))
    return NextResponse.json({ code: "ASSET_NOT_FOUND", message: "请提供可用图片素材" }, { status: 404 });
  try {
    const imageUrl = await createSignedObjectUrl(asset.storage_key, "GET", 900);
    const analysis = await callSophnetFaceVision(imageUrl, asset.original_name);
    const faceRegions = Array.isArray(analysis?.faceRegions)
      ? analysis.faceRegions.map(normalizeRegion).filter(Boolean).slice(0, 24)
      : [];
    return NextResponse.json({
      faceRegions,
      summary: typeof analysis?.summary === "string" ? analysis.summary.slice(0, 160) : "",
      providerConfigured: true,
    });
  } catch (error) {
    return NextResponse.json({
      faceRegions: [],
      summary: "人脸定位失败，已回退为多视图格子估算遮盖",
      providerConfigured: false,
      providerError: error instanceof Error ? error.message.slice(0, 160) : "FACE_MASK_ANALYSIS_FAILED",
    });
  }
}
