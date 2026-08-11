import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { createSignedObjectUrl } from "@/lib/cos";
import { authenticatedUser } from "@/lib/session";
import { isImageAssistantWorkflow } from "@/app/features/creation-assistant/workflows";

const sessionDays = 7;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function compact(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function stringList(value: unknown, maxItems = 5, maxLength = 40) {
  return Array.isArray(value)
    ? value.map((item) => compact(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function parseJsonObject(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM 返回内容不是 JSON");
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function providerConfig() {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    };
  }
  const apiKey = process.env.SOPHNET_CHAT_API_KEY || process.env.SOPHNET_VISION_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) return null;
  return {
    provider: "sophnet-chat",
    apiKey,
    baseUrl: process.env.SOPHNET_CHAT_BASE_URL || "https://www.sophnet.com/api/open-apis/v1",
    model: process.env.SOPHNET_CHAT_MODEL || "doubao-seed-2-0-mini-260428",
  };
}

async function ownedProject(projectId: string, userId: string) {
  const result = await db.query<{ id: string; workflow_key: string; payload_json: Record<string, unknown> }>(
    `SELECT id, workflow_key, payload_json
     FROM workflow_drafts
     WHERE id = $1 AND user_id = $2 AND status IN ('ACTIVE', 'ARCHIVED')`,
    [projectId, userId],
  );
  return result.rows[0] || null;
}

async function ownedReferenceImages(assetIds: string[], userId: string) {
  const ids = [...new Set(assetIds.filter(validUuid))].slice(0, 4);
  if (!ids.length) return [];
  const result = await db.query<{ id: string; storage_key: string; original_name: string | null }>(
    `SELECT id, storage_key, original_name
     FROM assets
     WHERE owner_id = $1
       AND id = ANY($2::uuid[])
       AND mime_type IN ('image/jpeg', 'image/png', 'image/webp')
       AND audit_status = 'READY'`,
    [userId, ids],
  );
  const byId = new Map(result.rows.map((asset) => [asset.id, asset]));
  return Promise.all(ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []).map(async (asset) => ({
    assetId: asset.id,
    name: asset.original_name || "参考图",
    url: await createSignedObjectUrl(asset.storage_key, "GET", 3600),
  })));
}

async function callAssistantLLM(options: {
  operation: string;
  system: string;
  userPrompt: string;
  imageUrls?: string[];
  requestLog: Record<string, unknown>;
}) {
  const config = providerConfig();
  if (!config) throw Object.assign(new Error("创作助手大模型尚未配置"), { status: 503, code: "LLM_NOT_CONFIGURED" });
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0.72,
      messages: [
        { role: "system", content: options.system },
        {
          role: "user",
          content: options.imageUrls?.length
            ? [
                { type: "text", text: options.userPrompt },
                ...options.imageUrls.slice(0, 4).map((url) => ({ type: "image_url", image_url: { url } })),
              ]
            : options.userPrompt,
        },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => null);
  await db.query(
    `INSERT INTO provider_call_logs (provider, operation, request_json, response_status, response_json, error_code, provider_request_id)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7)`,
    [
      config.provider,
      options.operation,
      JSON.stringify({ ...options.requestLog, model: config.model, imageCount: options.imageUrls?.length || 0 }),
      response.status,
      JSON.stringify(payload || {}),
      response.ok ? null : "CREATION_ASSISTANT_LLM_FAILED",
      payload?.id || response.headers.get("x-request-id"),
    ],
  );
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || payload?.message || `LLM HTTP ${response.status}`), { status: 502, code: "LLM_FAILED" });
  }
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw Object.assign(new Error("创作助手没有返回可用内容"), { status: 502, code: "LLM_EMPTY_RESPONSE" });
  return parseJsonObject(raw);
}

function normalizeSavedState(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const recommendations = record.recommendations && typeof record.recommendations === "object" && !Array.isArray(record.recommendations)
    ? record.recommendations as Record<string, unknown>
    : null;
  const messages = Array.isArray(record.messages)
    ? record.messages.slice(-24).map((item) => {
        const message = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          id: compact(message.id, 80) || crypto.randomUUID(),
          role: message.role === "user" ? "user" : "assistant",
          content: compact(message.content, 600),
        };
      }).filter((item) => item.content)
    : [];
  const referenceImages = Array.isArray(record.referenceImages)
    ? record.referenceImages.slice(0, 4).flatMap((item) => {
        const image = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return validUuid(image.assetId) ? [{ assetId: image.assetId, name: compact(image.name, 255) || "参考图" }] : [];
      })
    : [];
  return {
    step: ["service", "product", "direction", "result"].includes(String(record.step)) ? record.step : "service",
    goal: isImageAssistantWorkflow(record.goal) ? record.goal : "image-generate",
    sourceText: compact(record.sourceText, 3000),
    audience: compact(record.audience, 80),
    scene: compact(record.scene, 80),
    style: compact(record.style, 80),
    sellingPoint: compact(record.sellingPoint, 120),
    revision: compact(record.revision, 500),
    prompt: compact(record.prompt, 1200),
    recommendations: recommendations ? {
      productSummary: compact(recommendations.productSummary, 500),
      audiences: stringList(recommendations.audiences),
      scenes: stringList(recommendations.scenes),
      styles: stringList(recommendations.styles),
      sellingPoints: stringList(recommendations.sellingPoints, 5, 80),
      reply: compact(recommendations.reply, 500),
      question: compact(recommendations.question, 240),
      quickReplies: stringList(recommendations.quickReplies, 5, 60),
    } : null,
    messages,
    referenceImages,
    handoffPending: record.handoffPending === true,
    expiresAt: new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function normalizeRecommendations(value: unknown, sourceText: string) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    productSummary: compact(record.productSummary, 500) || sourceText.slice(0, 500) || "已根据当前商品图片整理商品特征",
    audiences: stringList(record.audiences),
    scenes: stringList(record.scenes),
    styles: stringList(record.styles),
    sellingPoints: stringList(record.sellingPoints, 5, 80),
    reply: compact(record.reply, 500) || "我已经整理好几个适合的创作方向，请选择或继续告诉我你的想法。",
    question: compact(record.question, 240) || "这几个方向里，哪一个最接近你想要的效果？",
    quickReplies: stringList(record.quickReplies, 5, 60),
  };
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!validUuid(projectId)) return NextResponse.json({ code: "INVALID_PROJECT" }, { status: 400 });
  const project = await ownedProject(projectId, user.id);
  if (!project) return NextResponse.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
  const assistant = project.payload_json?.creationAssistant as Record<string, unknown> | undefined;
  if (!assistant) return NextResponse.json({ assistant: null, workflowKey: project.workflow_key });
  const expiresAt = typeof assistant.expiresAt === "string" ? Date.parse(assistant.expiresAt) : 0;
  if (!expiresAt || expiresAt <= Date.now()) {
    await db.query("UPDATE workflow_drafts SET payload_json = payload_json - 'creationAssistant', updated_at = NOW() WHERE id = $1", [project.id]);
    return NextResponse.json({ assistant: null, workflowKey: project.workflow_key, expired: true });
  }
  const referenceAssetIds = Array.isArray(assistant.referenceImages)
    ? assistant.referenceImages.flatMap((item) => {
        const image = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return validUuid(image.assetId) ? [image.assetId] : [];
      })
    : [];
  const referenceImages = await ownedReferenceImages(referenceAssetIds, user.id);
  return NextResponse.json({ assistant: { ...assistant, referenceImages }, workflowKey: project.workflow_key });
}

export async function PUT(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !validUuid(body.projectId)) return NextResponse.json({ code: "INVALID_PROJECT" }, { status: 400 });
  const project = await ownedProject(body.projectId, user.id);
  if (!project) return NextResponse.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
  const assistant = normalizeSavedState(body.assistant);
  await db.query(
    `UPDATE workflow_drafts
     SET payload_json = jsonb_set(payload_json, '{creationAssistant}', $3::jsonb, true), updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [project.id, user.id, JSON.stringify(assistant)],
  );
  return NextResponse.json({ assistant });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !validUuid(body.projectId)) return NextResponse.json({ code: "INVALID_PROJECT" }, { status: 400 });
  const project = await ownedProject(body.projectId, user.id);
  if (!project) return NextResponse.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
  const goal = isImageAssistantWorkflow(body.goal) ? body.goal : isImageAssistantWorkflow(project.workflow_key) ? project.workflow_key : "image-generate";
  const sourceText = compact(body.sourceText, 3000);
  const action = body.action === "generate" ? "generate" : body.action === "refine" ? "refine" : "recommend";
  const imageUrls = stringList(body.imageUrls, 4, 1_500_000).filter((url) => url.startsWith("data:image/") || url.startsWith("https://"));
  const referenceAssetIds = Array.isArray(body.referenceAssetIds) ? body.referenceAssetIds.flatMap((value) => validUuid(value) ? [value] : []).slice(0, 4) : [];
  const savedRecommendations = body.recommendations && typeof body.recommendations === "object" && !Array.isArray(body.recommendations)
    ? body.recommendations as Record<string, unknown>
    : null;
  const recognizedProductText = compact(body.productSummary, 500) || compact(savedRecommendations?.productSummary, 500);
  const productContext = sourceText || recognizedProductText;
  if (action !== "recommend" && productContext.length < 2) {
    return NextResponse.json({ code: "PRODUCT_REQUIRED", message: "商品信息已丢失，请返回上一步重新识别商品" }, { status: 400 });
  }

  try {
    if (action === "recommend") {
      const referenceImages = await ownedReferenceImages(referenceAssetIds, user.id);
      const visionUrls = [...referenceImages.map((image) => image.url), ...imageUrls].slice(0, 4);
      if (sourceText.length < 2 && !visionUrls.length) {
        return NextResponse.json({ code: "PRODUCT_REQUIRED", message: "请先描述商品，或添加商品参考图" }, { status: 400 });
      }
      const result = await callAssistantLLM({
        operation: "image_creation_assistant_recommend",
        system: "你是资深电商视觉创意策划。根据少量商品信息主动发散，但不能虚构确定性的商品参数。只输出严格 JSON，不要 Markdown。",
        userPrompt: [
          "请理解用户的商品或创作想法，并推荐适合图片生成的方向。",
          "输出字段：productSummary、audiences、scenes、styles、sellingPoints、reply、question、quickReplies。",
          "audiences、scenes、styles、sellingPoints 都必须是 4 个简短、差异明显、可点击的中文选项。",
          "如果提供商品图片，必须先识别商品类别、外观结构、材质、颜色、包装和可见用途，再结合用户文字；不得忽略图片，也不得虚构图片里看不到的参数。",
          "推荐必须符合商品真实用途，禁止把所有商品都套用租房、家庭或年轻女性等固定人群。",
          "reply 用不超过 120 字说明你如何理解商品，并邀请用户选择方向。",
          "question 只追问一个最影响生成效果的问题；quickReplies 提供 3-5 个针对该问题的短选项。",
          `目标图片类型：${goal}`,
          `用户提供的信息：${sourceText || "用户未填写文字，请重点识别当前商品图片"}`,
        ].join("\n"),
        imageUrls: visionUrls,
        requestLog: { userId: user.id, projectId: project.id, goal, sourceLength: sourceText.length },
      });
      return NextResponse.json({ recommendations: normalizeRecommendations(result, sourceText) });
    }

    if (action === "refine") {
      const userMessage = compact(body.userMessage, 500);
      if (!userMessage) return NextResponse.json({ code: "MESSAGE_REQUIRED", message: "请告诉我你想怎样调整" }, { status: 400 });
      const current = normalizeRecommendations(body.recommendations, productContext);
      const history = Array.isArray(body.messages)
        ? body.messages.slice(-10).map((item) => {
            const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
            return `${record.role === "user" ? "用户" : "助手"}：${compact(record.content, 260)}`;
          }).filter(Boolean).join("\n")
        : "";
      const result = await callAssistantLLM({
        operation: "image_creation_assistant_refine",
        system: "你是资深电商视觉创意顾问。通过多轮对话吸收用户纠偏，更新创作方向，每轮最多追问一个关键问题。只输出严格 JSON。",
        userPrompt: [
          "请根据用户最新回答校正商品理解和图片创作方向。",
          "输出字段：productSummary、audiences、scenes、styles、sellingPoints、reply、question、quickReplies。",
          "每组推荐保留 4 个具体选项，把最推荐的选项放在第一位。",
          "reply 先明确你吸收了什么修改；question 只问一个仍然影响成片的问题；quickReplies 给出 3-5 个可点击答案。",
          `目标图片类型：${goal}`,
          `商品信息：${productContext}`,
          `当前商品理解：${current.productSummary}`,
          `当前受众：${compact(body.audience, 80)}`,
          `当前场景：${compact(body.scene, 80)}`,
          `当前风格：${compact(body.style, 80)}`,
          `当前卖点：${compact(body.sellingPoint, 120)}`,
          history ? `最近对话：\n${history}` : "最近对话：暂无",
          `用户最新回答：${userMessage}`,
        ].join("\n"),
        requestLog: { userId: user.id, projectId: project.id, goal },
      });
      return NextResponse.json({ recommendations: normalizeRecommendations(result, productContext) });
    }

    const audience = compact(body.audience, 80);
    const scene = compact(body.scene, 80);
    const style = compact(body.style, 80);
    const sellingPoint = compact(body.sellingPoint, 120);
    const revision = compact(body.revision, 500);
    const productSummary = recognizedProductText || sourceText.slice(0, 500);
    const result = await callAssistantLLM({
      operation: "image_creation_assistant_prompt",
      system: "你是资深商业摄影导演和 AI 图片提示词专家。把用户选择转成可直接提交给图片模型的中文提示词。只输出严格 JSON，不要 Markdown。",
      userPrompt: [
        "生成一个完整、具体、可执行的图片提示词。",
        "输出字段：prompt、summary。",
        "prompt 控制在 180-600 个中文字符，必须描述主体、场景、构图、镜头、光线、材质、动作或陈列、商业目标和质量要求。",
        "不要生成可读文字、价格、水印或竞品品牌；不要杜撰商品不存在的结构与功能。",
        "如果是高清、白底或比例调整，重点必须是保持商品身份、颜色、结构和材质，不要重做成另一件商品。",
        `目标图片类型：${goal}`,
        `商品理解：${productSummary}`,
        `目标用户：${audience || "由模型合理判断"}`,
        `使用场景：${scene || "由模型合理判断"}`,
        `视觉风格：${style || "真实商业摄影"}`,
        `核心卖点：${sellingPoint || "突出商品最可信的核心价值"}`,
        revision ? `用户修正意见：${revision}` : "用户修正意见：无",
      ].join("\n"),
      requestLog: { userId: user.id, projectId: project.id, goal },
    });
    return NextResponse.json({
      prompt: compact(result.prompt, 1200),
      summary: compact(result.summary, 300) || "已根据商品、受众、场景和视觉方向生成提示词。",
    });
  } catch (error) {
    const caught = error as Error & { status?: number; code?: string };
    return NextResponse.json({ code: caught.code || "ASSISTANT_FAILED", message: caught.message || "创作助手暂时不可用" }, { status: caught.status || 500 });
  }
}
