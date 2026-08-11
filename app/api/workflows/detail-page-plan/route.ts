import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { normalizeDetailPlans } from "@/lib/detail-page-plans";
import { redis } from "@/lib/redis";
import { authenticatedUser } from "@/lib/session";

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseObject(value: string) {
  try { return JSON.parse(value); } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("方案模型没有返回 JSON");
    return JSON.parse(match[0]);
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const attemptsKey = `detail-page-plan:attempts:${user.id}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, 10 * 60);
  if (attempts > 12) return NextResponse.json({ code: "PLAN_RATE_LIMITED", message: "方案生成过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": "600" } });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const assetId = clean(body?.assetId, 64);
  if (!assetId) return NextResponse.json({ code: "ASSET_REQUIRED", message: "请先上传商品图片" }, { status: 400 });

  const assetResult = await db.query<{ storage_key: string; mime_type: string }>(
    "SELECT storage_key, mime_type FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'READY'",
    [assetId, user.id],
  );
  const asset = assetResult.rows[0];
  if (!asset?.mime_type.startsWith("image/")) return NextResponse.json({ code: "ASSET_NOT_READY", message: "商品图片不可用" }, { status: 404 });

  const apiKey = process.env.SOPHNET_CHAT_API_KEY || process.env.SOPHNET_VISION_API_KEY || process.env.AI_API_KEY;
  const baseUrl = process.env.SOPHNET_CHAT_BASE_URL || "https://www.sophnet.com/api/open-apis/v1";
  const model = process.env.SOPHNET_CHAT_MODEL || "doubao-seed-2-0-mini-260428";
  if (!apiKey) return NextResponse.json({ code: "LLM_NOT_CONFIGURED", message: "详情页方案服务暂未配置" }, { status: 503 });

  const imageUrl = await createSignedObjectUrl(asset.storage_key, "GET", 900);
  const productDescription = clean(body?.productDescription, 900);
  const mode = body?.mode === "recreate" ? "recreate" : "original";
  const prompt = [
    "你是资深电商详情页策划、文案和视觉导演。先识别商品图片中的品类、结构、材质、可见卖点和适用人群，再设计详情页。",
    "只输出严格 JSON，不要 Markdown。根对象字段为 productUnderstanding 和 plans。productUnderstanding 用一段话说明识别到的商品、可见特点和策划判断；plans 必须恰好 3 项，分别代表转化卖点型、品牌氛围型、参数说明型。",
    "每个方案字段：title、strategy、suitableFor、cards。三套方案要有明显不同的叙事逻辑，不能只换标题。",
    "cards 为有序数组，每套 6 到 8 张。每张字段：role、title、subtitle、visualPrompt。",
    "role 是卡片作用；title 是不超过 16 个汉字的主标题；subtitle 是可直接用于排版的辅助文案；visualPrompt 只描述干净商品画面、镜头、场景、光线、留白和对应卖点，不要求图片模型绘制任何文字。",
    "卡片应覆盖首屏价值、用户痛点或需求、核心卖点、结构材质或不同角度、真实使用场景、规格或适配信息、信任收口。不要虚构无法从图片或商品描述确认的参数和认证。",
    mode === "recreate" ? "这是复刻商详任务：只参考用户指定的模块节奏与商业方向，必须为当前商品创作原创画面和文案。" : "这是原创商品详情页任务。",
    `用户商品信息：${productDescription || "未补充，请以图片识别为主"}`,
    "视觉场景、风格和构图由商品识别结果与用户文字共同决定，不使用预设枚举。",
  ].join("\n");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl } }] }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => null);
  await db.query(
    `INSERT INTO provider_call_logs (provider, operation, request_json, response_status, response_json, error_code, provider_request_id)
     VALUES ('sophnet-chat', 'detail_page_plan', $1::jsonb, $2, $3::jsonb, $4, $5)`,
    [JSON.stringify({ model, mode, assetId }), response.status, JSON.stringify(payload || {}), response.ok ? null : "DETAIL_PLAN_LLM_FAILED", payload?.id || response.headers.get("x-request-id") || randomUUID()],
  );
  if (!response.ok) return NextResponse.json({ code: "LLM_FAILED", message: payload?.error?.message || payload?.message || "详情页方案生成失败" }, { status: 502 });
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") return NextResponse.json({ code: "LLM_EMPTY", message: "方案模型没有返回内容" }, { status: 502 });
  const parsed = parseObject(raw);
  const plans = normalizeDetailPlans(parsed?.plans);
  if (plans.length !== 3) return NextResponse.json({ code: "LLM_PLAN_INCOMPLETE", message: "方案结构不完整，请重新生成" }, { status: 502 });
  return NextResponse.json({ plans, productUnderstanding: clean(parsed?.productUnderstanding, 240) });
}
