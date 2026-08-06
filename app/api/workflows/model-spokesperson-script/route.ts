import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { authenticatedUser } from "@/lib/session";

const tones = ["natural", "enthusiastic", "professional"] as const;
const durations = [15, 30, 60] as const;
const toneLabels: Record<(typeof tones)[number], string> = {
  natural: "自然种草",
  enthusiastic: "强带货",
  professional: "专业讲解",
};

type Tone = (typeof tones)[number];
type Duration = (typeof durations)[number];
type Segment = {
  id: string;
  stage: string;
  timeRange: string;
  narration: string;
  visual: string;
};
type ScriptResult = {
  status: "READY";
  draftId: string;
  title: string;
  durationSeconds: Duration;
  tone: string;
  segments: Segment[];
  fullScript: string;
  alternativeOpeners: string[];
  generatedAt: string;
};
type ScriptPlan = {
  id: string;
  label: string;
  title: string;
  angle: string;
  sellingPointSummary: string[];
  modelDirection: string;
  productDirection: string;
  internalPrompt: string;
  script: ScriptResult;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength)
    : "";
}

function splitPoints(value: string) {
  return value
    .split(/[\n，,；;。]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function compact(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").replace(/[。；;，,]+$/g, "").trim();
  if (normalized.length <= maxLength) return normalized;
  const sentence = normalized
    .split(/[。！？!?；;]/)
    .map((item) => item.trim())
    .find((item) => item.length > 4 && item.length <= maxLength);
  return (sentence || normalized.slice(0, maxLength)).replace(/[。；;，,]+$/g, "").trim();
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
  const sophnetKey =
    process.env.SOPHNET_CHAT_API_KEY ||
    process.env.SOPHNET_VISION_API_KEY ||
    process.env.AI_API_KEY;
  if (sophnetKey) {
    return {
      provider: "sophnet-chat",
      apiKey: sophnetKey,
      baseUrl: process.env.SOPHNET_CHAT_BASE_URL || "https://www.sophnet.com/api/open-apis/v1",
      model: process.env.SOPHNET_CHAT_MODEL || "doubao-seed-2-0-mini-260428",
    };
  }
  return null;
}

function parseJsonObject(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const matched = raw.match(/\{[\s\S]*\}/);
    if (!matched) throw new Error("LLM 返回内容不是 JSON");
    return JSON.parse(matched[0]);
  }
}

async function callScriptLLM(options: {
  operation: string;
  prompt: string;
  requestLog: Record<string, unknown>;
}) {
  const config = providerConfig();
  if (!config) {
    throw Object.assign(new Error("请先配置 DeepSeek 或 SophNet Chat 大模型后再生成口播方案"), {
      code: "LLM_NOT_CONFIGURED",
      status: 503,
    });
  }
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0.72,
      messages: [
        {
          role: "system",
          content: [
            "你是资深电商短视频口播导演和转化文案策划。",
            "你必须真正理解用户商品描述，生成可拍摄、可口播、15秒内讲得清楚的方案。",
            "只输出严格 JSON，不要 Markdown，不要解释。",
          ].join("\n"),
        },
        { role: "user", content: options.prompt },
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
      JSON.stringify({ ...options.requestLog, model: config.model }),
      response.status,
      JSON.stringify(payload || {}),
      response.ok ? null : "LLM_CHAT_HTTP_ERROR",
      payload?.id || response.headers.get("x-request-id"),
    ],
  );
  if (!response.ok) {
    throw Object.assign(
      new Error(payload?.message || payload?.error?.message || `LLM HTTP ${response.status}`),
      { code: "LLM_CHAT_FAILED", status: 502 },
    );
  }
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw Object.assign(new Error("大模型没有返回可用文本"), {
      code: "LLM_EMPTY_RESPONSE",
      status: 502,
    });
  }
  return parseJsonObject(raw);
}

function plansPrompt(input: {
  productName: string;
  sellingPoints: string;
  points: string[];
  tone: Tone;
  duration: Duration;
  productImageCount: number;
}) {
  return [
    "请为 AI 模特口播视频生成 A/B/C 三套 15 秒带货方案，输出严格 JSON。",
    "JSON 结构：{ \"plans\": [ ...3项... ] }。",
    "每个 plan 字段必须为：label、title、angle、sellingPointSummary、modelDirection、productDirection、internalPrompt、script。",
    "label 必须分别是 A、B、C。",
    "A 必须是真实种草型，B 必须是痛点转化型，C 必须是专业讲解型。三套不能只是换皮，切入角度、卖点排序、动作设计都要不同。",
    "script 字段必须包含：title、tone、segments、alternativeOpeners。",
    "segments 必须正好 4 段，字段：stage、timeRange、narration、visual。",
    "4 段时间固定为：0-3秒、3-8秒、8-12秒、12-15秒。",
    "所有 narration 加起来必须 45-65 个中文字；每段 narration 不超过 18 个中文字。",
    "讲稿必须短、口语、具体、能真人自然说出口；禁止空泛套话，禁止长句，禁止绝对化宣传。",
    "必须出现商品名或商品类型，最多讲 2 个核心卖点，必须有一个具体使用场景。",
    "visual 要写清楚模特动作、商品入镜方式、镜头景别和细节特写，不要泛泛写展示商品。",
    "productDirection 必须说明商品多视图参考板如何生成和使用：正面、侧面、材质/功能细节、使用状态、包装/比例锁定。",
    "modelDirection 必须说明模特动作：注视、拿起、指向、靠近镜头、收尾动作。",
    "internalPrompt 必须是隐藏给视频模型的中文提示词，包含商品多视图、虚拟模特多视图、动作导演脚本、字幕节奏；不得给用户显示。",
    "如果用户上传了真人/模特图，internalPrompt 必须要求先合规安检、隐私化、虚拟模特多视图，不得直接提交可识别真人脸。",
    `商品名称：${input.productName}`,
    `用户描述/卖点：${input.sellingPoints}`,
    `拆分卖点：${input.points.join("、")}`,
    `用户选择口吻：${toneLabels[input.tone]}`,
    `目标时长：${input.duration} 秒`,
    `用户上传商品图数量：${input.productImageCount}`,
  ].join("\n");
}

function scriptPrompt(input: {
  productName: string;
  sellingPoints: string;
  points: string[];
  tone: Tone;
  duration: Duration;
}) {
  return [
    "请生成一版 AI 模特口播讲稿，输出严格 JSON。",
    "JSON 字段：title、tone、segments、alternativeOpeners。",
    "segments 正好 4 段，字段：stage、timeRange、narration、visual。",
    "时间固定为：0-3秒、3-8秒、8-12秒、12-15秒。",
    "所有 narration 加起来必须 45-65 个中文字，每段不超过 18 个中文字。",
    "讲稿必须具体、短、自然，不要模板腔，不要长句，不要绝对化宣传。",
    `商品名称：${input.productName}`,
    `用户描述/卖点：${input.sellingPoints}`,
    `拆分卖点：${input.points.join("、")}`,
    `口吻：${toneLabels[input.tone]}`,
    `目标时长：${input.duration} 秒`,
  ].join("\n");
}

function normalizeSegments(value: unknown): Segment[] {
  const input = Array.isArray(value) ? value.slice(0, 4) : [];
  if (input.length !== 4) throw new Error("LLM 讲稿分镜数量不正确");
  const ranges = ["0-3 秒", "3-8 秒", "8-12 秒", "12-15 秒"];
  return input.map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const narration = compact(record.narration, 20);
    const visual = compact(record.visual, 90);
    const stage = compact(record.stage, 12) || ["开场钩子", "核心卖点", "场景展示", "行动引导"][index];
    if (!narration || !visual) throw new Error("LLM 讲稿缺少口播或画面建议");
    return {
      id: randomUUID(),
      stage,
      timeRange: ranges[index],
      narration,
      visual,
    };
  });
}

function normalizeScript(value: unknown, fallbackTitle: string, duration: Duration): ScriptResult {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const segments = normalizeSegments(record.segments);
  const fullScript = segments.map((segment) => segment.narration).join("\n");
  const characterCount = fullScript.replace(/\s/g, "").length;
  if (characterCount > 72) throw new Error("LLM 讲稿超过 15 秒字数限制");
  return {
    status: "READY",
    draftId: randomUUID(),
    title: compact(record.title, 40) || fallbackTitle,
    durationSeconds: duration,
    tone: compact(record.tone, 16) || "自然口播",
    segments,
    fullScript,
    alternativeOpeners: Array.isArray(record.alternativeOpeners)
      ? record.alternativeOpeners.map((item) => compact(item, 22)).filter(Boolean).slice(0, 3)
      : [],
    generatedAt: new Date().toISOString(),
  };
}

function normalizePlans(value: unknown, productName: string, duration: Duration): ScriptPlan[] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawPlans = Array.isArray(record.plans) ? record.plans.slice(0, 3) : [];
  if (rawPlans.length !== 3) throw new Error("LLM 必须返回 A/B/C 三套方案");
  const labels = ["A", "B", "C"];
  return rawPlans.map((item, index) => {
    const plan = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const label = labels[index];
    const script = normalizeScript(
      plan.script,
      `${productName} · ${label} 方案 15 秒口播稿`,
      duration,
    );
    const sellingPointSummary = Array.isArray(plan.sellingPointSummary)
      ? plan.sellingPointSummary.map((point) => compact(point, 18)).filter(Boolean).slice(0, 4)
      : [];
    const angle = compact(plan.angle, 120);
    const modelDirection = compact(plan.modelDirection, 180);
    const productDirection = compact(plan.productDirection, 180);
    const internalPrompt = compact(plan.internalPrompt, 900);
    if (!angle || !modelDirection || !productDirection || !internalPrompt) {
      throw new Error("LLM 方案缺少动作、多视图或内部提示词");
    }
    return {
      id: `plan-${label.toLowerCase()}`,
      label,
      title: compact(plan.title, 32) || `${label} 方案`,
      angle,
      sellingPointSummary,
      modelDirection,
      productDirection,
      internalPrompt,
      script,
    };
  });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user)
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const attemptsKey = `spokesperson-script:attempts:${user.id}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, 10 * 60);
  if (attempts > 30) {
    return NextResponse.json(
      { code: "SCRIPT_RATE_LIMITED", message: "文案生成过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const body = await request.json().catch(() => null);
  const productName = text(body?.productName, 80);
  const sellingPoints = text(body?.sellingPoints, 1000);
  const mode = body?.mode === "plans" ? "plans" : "script";
  const tone = tones.includes(body?.tone) ? (body.tone as Tone) : "natural";
  const duration = durations.includes(Number(body?.duration) as Duration)
    ? (Number(body.duration) as Duration)
    : 15;
  const points = splitPoints(sellingPoints);
  const productImageCount = Math.max(0, Math.min(8, Number(body?.productImageCount) || 0));

  if (!productName || !points.length) {
    return NextResponse.json(
      {
        code: "SCRIPT_INPUT_REQUIRED",
        message: "请填写商品名称和至少一个核心卖点",
      },
      { status: 400 },
    );
  }

  try {
    if (mode === "plans") {
      const raw = await callScriptLLM({
        operation: "model_spokesperson_script_plans",
        prompt: plansPrompt({ productName, sellingPoints, points, tone, duration, productImageCount }),
        requestLog: {
          mode,
          productName,
          sellingPointCount: points.length,
          tone,
          duration,
          productImageCount,
        },
      });
      const plans = normalizePlans(raw, productName, duration);
      await audit(user.id, "MODEL_SPOKESPERSON_SCRIPT_PLANS_GENERATED", request, {
        type: "script_plan_set",
        id: randomUUID(),
      }, {
        duration,
        llmRequired: true,
        planCount: plans.length,
        characterCount: plans
          .map((plan) => plan.script.fullScript)
          .join("")
          .replace(/\s/g, "").length,
      });
      return NextResponse.json({
        status: "READY",
        provider: "llm",
        plans,
        generatedAt: new Date().toISOString(),
      });
    }

    const raw = await callScriptLLM({
      operation: "model_spokesperson_script_single",
      prompt: scriptPrompt({ productName, sellingPoints, points, tone, duration }),
      requestLog: { mode, productName, sellingPointCount: points.length, tone, duration },
    });
    const result = normalizeScript(raw, `${productName} · ${duration} 秒口播稿`, duration);
    await audit(user.id, "MODEL_SPOKESPERSON_SCRIPT_GENERATED", request, {
      type: "script_draft",
      id: result.draftId,
    }, {
      duration,
      tone,
      llmRequired: true,
      segmentCount: result.segments.length,
      characterCount: result.fullScript.replace(/\s/g, "").length,
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 502;
    const code = typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "LLM_SCRIPT_GENERATION_FAILED";
    return NextResponse.json(
      {
        code,
        message: error instanceof Error ? error.message : "大模型口播方案生成失败",
      },
      { status },
    );
  }
}
