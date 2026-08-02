import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

const materialKinds = new Set(["person", "product", "scene", "text", "unknown"]);

function normalizeKind(value: unknown) {
  return typeof value === "string" && materialKinds.has(value) ? value : "unknown";
}

function fallbackFromName(name: string | null) {
  const text = (name || "").toLowerCase();
  if (/人|模特|model|person|portrait|face/.test(text)) return "person";
  if (/商品|产品|衣服|服装|包|鞋|杯|product|sku|goods|item/.test(text)) return "product";
  if (/场景|背景|空间|scene|background|room/.test(text)) return "scene";
  if (/logo|字幕|文字|text|brand/.test(text)) return "text";
  return "unknown";
}

async function callSophnetMaterialVision(imageUrl: string, originalName: string | null) {
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
        "你是电商短视频复刻工作台的素材识别器。请判断输入图片最适合做哪类 reference。",
        "只输出严格 JSON，不要 Markdown。",
        "JSON 字段：kind、confidence、summary、suggestedAction、riskNotes。",
        "kind 只能是 person、product、scene、text、unknown。",
        "person：真人、模特、人物半身/全身/脸部/肢体穿搭。",
        "product：商品主体、服装平铺、包装、配件、静物。",
        "scene：背景、空间、室内外环境、氛围参考。",
        "text：Logo、品牌字样、字幕、海报文字占主导。",
        "如果包含可识别真人脸或真人人物，请优先判为 person，并在 suggestedAction 中建议生成隐私化多角度参考。",
        "如果是商品或服装静物，请建议生成商品/物体多视图参考，不要做脸部遮挡。",
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
     VALUES ('sophnet-chat', 'recreate_material_analysis', $1::jsonb, $2, $3::jsonb, $4, $5)`,
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
    return NextResponse.json({ code: "INVALID_ASSET", message: "请先上传素材" }, { status: 400 });
  const result = await db.query<{
    id: string;
    storage_key: string;
    mime_type: string;
    original_name: string | null;
    metadata_json: Record<string, unknown>;
  }>(
    "SELECT id, storage_key, mime_type, original_name, metadata_json FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'READY'",
    [body.assetId, user.id],
  );
  const asset = result.rows[0];
  if (!asset || !asset.mime_type.startsWith("image/"))
    return NextResponse.json({ code: "ASSET_NOT_FOUND", message: "请提供可用图片素材" }, { status: 404 });
  const imageUrl = await createSignedObjectUrl(asset.storage_key, "GET", 900);
  const fallbackKind = fallbackFromName(asset.original_name);
  try {
    const analysis = await callSophnetMaterialVision(imageUrl, asset.original_name);
    const normalized = {
      kind: normalizeKind(analysis?.kind),
      confidence: Math.max(0, Math.min(1, Number(analysis?.confidence) || 0)),
      summary: typeof analysis?.summary === "string" ? analysis.summary.slice(0, 120) : "已完成素材识别",
      suggestedAction: typeof analysis?.suggestedAction === "string" ? analysis.suggestedAction.slice(0, 160) : "",
      riskNotes: Array.isArray(analysis?.riskNotes) ? analysis.riskNotes.filter((item: unknown) => typeof item === "string").slice(0, 3) : [],
      providerConfigured: true,
    };
    await db.query(
      "UPDATE assets SET metadata_json = metadata_json || $2::jsonb, updated_at = NOW() WHERE id = $1",
      [asset.id, JSON.stringify({ recreateMaterialAnalysis: normalized })],
    );
    return NextResponse.json(normalized);
  } catch (error) {
    const fallback = {
      kind: fallbackKind,
      confidence: fallbackKind === "unknown" ? 0 : 0.45,
      summary: fallbackKind === "unknown" ? "暂未识别出明确类型，可按通用素材处理" : "已根据文件名做基础判断",
      suggestedAction: fallbackKind === "person" ? "建议生成隐私化多角度人物参考" : "建议生成商品/素材多视图参考",
      riskNotes: [error instanceof Error ? error.message.slice(0, 120) : "素材识别失败"],
      providerConfigured: false,
    };
    return NextResponse.json(fallback);
  }
}
