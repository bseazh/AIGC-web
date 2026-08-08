import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { structuredLog, requestContext } from "@/lib/logger";
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
  storyArc: string;
  actionBeats: string[];
  sellingPointSummary: string[];
  modelDirection: string;
  productDirection: string;
  internalPrompt: string;
  script: ScriptResult;
};
type SelectedPlanInput = {
  id?: string;
  label?: string;
  title?: string;
  angle?: string;
  storyArc?: string;
  actionBeats?: string[];
  sellingPointSummary?: string[];
  modelDirection?: string;
  productDirection?: string;
  internalPrompt?: string;
  script?: ScriptResult;
};
type DirectorBriefInput = {
  audience?: string;
  usageScene?: string;
  valueFocus?: string;
  storyStyle?: string;
  peopleMode?: string;
  productUnderstanding?: string;
};
type VideoPackResult = {
  status: "READY";
  draftId: string;
  title: string;
  selectedPlanId: string;
  selectedPlanLabel: string;
  productMultiview: {
    summary: string;
    views: Array<{
      name: string;
      purpose: string;
      prompt: string;
      note: string;
    }>;
  };
  modelRecommendation: {
    mode: "auto" | "asset_library" | "blurred_reference";
    label: string;
    reason: string;
    maskingAdvice: string;
  };
  storyboard: {
    summary: string;
    frames: Array<{
      index: number;
      timeRange: string;
      scene?: string;
      intent?: string;
      visual: string;
      camera: string;
      narration: string;
      assetUse: string;
    }>;
  };
  bindings: Array<{
    segmentId: string;
    timeRange: string;
    narration: string;
    frameIndexes: number[];
    note: string;
  }>;
  finalPrompt: string;
  generatedAt: string;
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

async function callDirectorVision(options: {
  productName: string;
  sellingPoints: string;
  imageUrls: string[];
  requestLog: Record<string, unknown>;
}) {
  const config = providerConfig();
  if (!config) {
    throw Object.assign(new Error("请先配置 DeepSeek 或 SophNet Chat 大模型后再识别商品"), {
      code: "LLM_NOT_CONFIGURED",
      status: 503,
    });
  }
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: [
        "你是电商短视频商品导演。请根据用户上传的商品图和少量文字，识别商品并推荐广告拍摄方向。",
        "只输出严格 JSON，不要 Markdown，不要解释。",
        "JSON 字段：productName、productUnderstanding、audience、usageScene、valueFocus、storyStyle、peopleMode、sellingPoints。",
        "productName：尽量给出具体商品名或商品类型；如果看不清，输出用户上传商品。",
        "productUnderstanding：用 80-160 字讲清楚商品是什么、适合谁、解决什么问题、为什么值得拍。",
        "audience 必须是以下之一：系统推荐、工程采购、活动主办方、商铺老板、展厅/门店负责人、家庭用户。",
        "usageScene 必须是以下之一：系统推荐、会议室、展厅、商铺、活动现场、客厅、办公空间。",
        "valueFocus 必须是以下之一：系统推荐、空间更整洁、声音覆盖、安装美观、采购省心、高级质感、性价比。",
        "storyStyle 必须是以下之一：系统推荐、采购决策、场景痛点、前后对比、高级空间感、专业讲解。",
        "peopleMode 必须是 no_people、hands_or_back、spokesperson 之一；默认优先 no_people 或 hands_or_back，不要主动推荐清晰真人出镜。",
        "sellingPoints 是数组，输出 3-5 个可拍摄卖点，每个不超过 18 字。",
        `用户填写商品名：${options.productName || "未填写"}`,
        `用户补充：${options.sellingPoints || "未填写"}`,
      ].join("\n"),
    },
    ...options.imageUrls.slice(0, 4).map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0.5,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => null);
  await db.query(
    `INSERT INTO provider_call_logs (provider, operation, request_json, response_status, response_json, error_code, provider_request_id)
     VALUES ($1, 'model_spokesperson_director_brief', $2::jsonb, $3, $4::jsonb, $5, $6)`,
    [
      config.provider,
      JSON.stringify({ ...options.requestLog, model: config.model, imageCount: options.imageUrls.length }),
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
    throw Object.assign(new Error("大模型没有返回可用商品识别文本"), {
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
  directorBrief: DirectorBriefInput;
}) {
  const directorLines = directorBriefLines(input.directorBrief);
  return [
    "请为商品口播导演视频生成 A/B/C 三套 15 秒带货方案，输出严格 JSON。",
    "JSON 结构：{ \"plans\": [ ...3项... ] }。",
    "每个 plan 字段必须为：label、title、angle、storyArc、actionBeats、sellingPointSummary、modelDirection、productDirection、internalPrompt、script。",
    "label 必须分别是 A、B、C。",
    "A 必须是真实种草型，B 必须是痛点转化型，C 必须是专业讲解型。三套不能只是换皮，切入角度、卖点排序、故事情节、场景变化和动作设计都要不同。",
    "storyArc 必须用一句话讲清楚这条广告的情节：谁在什么场景遇到什么问题，商品如何被引出，哪个动作证明卖点，最后获得什么改善。",
    "actionBeats 必须正好 4 条，对应 0-3秒、3-8秒、8-12秒、12-15秒；每条都必须包含场景、人物动作、商品位置、镜头运动和卖点目的。",
    "script 字段必须包含：title、tone、segments、alternativeOpeners。",
    "segments 必须正好 4 段，字段：stage、timeRange、narration、visual。",
    "4 段时间固定为：0-3秒、3-8秒、8-12秒、12-15秒。",
    "所有 narration 加起来必须 45-65 个中文字；每段 narration 不超过 18 个中文字。",
    "讲稿必须短、口语、具体、能真人自然说出口；禁止空泛套话，禁止长句，禁止绝对化宣传。",
    "必须出现商品名或商品类型，最多讲 2 个核心卖点，必须有一个具体使用场景。",
    "visual 要写清楚模特动作、商品入镜方式、镜头景别和细节特写，不要泛泛写展示商品。",
    "productDirection 必须说明商品多视图参考板如何生成和使用：正面、侧面、材质/功能细节、使用状态、包装/比例锁定。",
    "modelDirection 必须说明模特动作链路：从场景问题、拿起/靠近/操作商品、细节证明、情绪反馈到收尾；禁止只写注视、拿起、指向。",
    "internalPrompt 必须是隐藏给视频模型的中文提示词，包含商品多视图、虚拟模特多视图、动作导演脚本、故事弧线、字幕节奏；不得给用户显示。",
    "如果用户上传了真人/模特图，internalPrompt 必须要求先合规安检、隐私化、虚拟模特多视图，不得直接提交可识别真人脸。",
    "请先像广告导演一样理解商品价值，再把卖点变成故事动作，不要把方案写成单纯口播稿。",
    "如果用户选择不需要真人，方案和分镜必须以商品、空间、安装/操作过程、场景前后变化为主；最终视频可只使用手部、背影或无人物镜头。",
    `商品名称：${input.productName}`,
    `用户描述/卖点：${input.sellingPoints}`,
    `拆分卖点：${input.points.join("、")}`,
    `用户选择口吻：${toneLabels[input.tone]}`,
    `目标时长：${input.duration} 秒`,
    `用户上传商品图数量：${input.productImageCount}`,
    ...directorLines,
  ].join("\n");
}

function directorBriefLines(brief: DirectorBriefInput) {
  return [
    "导演问答/商品理解：",
    `- 商品理解：${compact(brief.productUnderstanding, 260) || "由商品名称、描述和图片数量推断商品用途、目标用户和场景价值"}`,
    `- 目标用户：${compact(brief.audience, 80) || "系统推荐"}`,
    `- 使用场景：${compact(brief.usageScene, 80) || "系统推荐"}`,
    `- 价值重点：${compact(brief.valueFocus, 80) || "系统推荐"}`,
    `- 故事表达：${compact(brief.storyStyle, 80) || "系统推荐"}`,
    `- 人物参与：${compact(brief.peopleMode, 80) || "no_people"}`,
  ];
}

function oneOf(value: unknown, allowed: string[], fallback: string) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function normalizeDirectorBrief(value: unknown, fallback: DirectorBriefInput) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const sellingPoints = Array.isArray(record.sellingPoints)
    ? record.sellingPoints.map((item) => compact(item, 18)).filter(Boolean).slice(0, 5)
    : [];
  return {
    productName: compact(record.productName, 80),
    directorBrief: {
      productUnderstanding: compact(record.productUnderstanding, 260) || compact(fallback.productUnderstanding, 260),
      audience: oneOf(record.audience, ["系统推荐", "工程采购", "活动主办方", "商铺老板", "展厅/门店负责人", "家庭用户"], "系统推荐"),
      usageScene: oneOf(record.usageScene, ["系统推荐", "会议室", "展厅", "商铺", "活动现场", "客厅", "办公空间"], "系统推荐"),
      valueFocus: oneOf(record.valueFocus, ["系统推荐", "空间更整洁", "声音覆盖", "安装美观", "采购省心", "高级质感", "性价比"], "系统推荐"),
      storyStyle: oneOf(record.storyStyle, ["系统推荐", "采购决策", "场景痛点", "前后对比", "高级空间感", "专业讲解"], "系统推荐"),
      peopleMode: oneOf(record.peopleMode, ["no_people", "hands_or_back", "spokesperson"], "no_people"),
    },
    sellingPoints,
  };
}

function scriptPrompt(input: {
  productName: string;
  sellingPoints: string;
  points: string[];
  tone: Tone;
  duration: Duration;
}) {
  return [
    "请生成一版商品口播讲稿，输出严格 JSON。",
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

function packPrompt(input: {
  productName: string;
  sellingPoints: string;
  points: string[];
  tone: Tone;
  duration: Duration;
  productImageCount: number;
  selectedPlan: SelectedPlanInput;
  directorBrief: DirectorBriefInput;
}) {
  const scriptSegments = Array.isArray(input.selectedPlan.script?.segments)
    ? input.selectedPlan.script?.segments
    : [];
  const directorLines = directorBriefLines(input.directorBrief);
  return [
    "请为商品口播导演视频生成一个可直接提交的视频任务包，输出严格 JSON。",
    "JSON 结构必须包含：summary、productMultiview、modelRecommendation、storyboard、bindings、finalPrompt。",
    "productMultiview.summary 要用一句话概括商品多视图将如何生成；views 必须正好 5 条，依次为正面、侧面、45度、细节特写、使用状态。",
    "productMultiview.views 每项包含：name、purpose、prompt、note；prompt 必须写成能直接给图像模型使用的中文提示词。",
    "modelRecommendation 包含：mode、label、reason、maskingAdvice；mode 只能是 auto、asset_library、blurred_reference 之一。",
    "如果素材里出现真人、模特或可识别脸部，优先建议 blurred_reference 或 asset_library，不得直接暴露真人脸。",
    "storyboard.summary 要简短说明 12 宫格的故事弧线、使用场景和镜头逻辑；frames 必须正好 12 条，按 0-15 秒顺序排列。",
    "storyboard.frames 每项包含：index、timeRange、scene、intent、visual、camera、narration、assetUse；必须让画面、口播、动作、场景和卖点彼此对应。",
    "12 格必须是一条有情节的 15 秒小广告：1-2 格建立使用场景/问题，3-5 格引出商品和核心卖点，6-8 格展示细节或使用过程，9-10 格体现效果/情绪反馈，11-12 格收尾和购买引导。",
    "每格 intent 必须说明这一格为什么存在：痛点、引出、卖点证明、细节放大、使用示范、效果反馈、信任增强或行动引导之一；不能只写动作。",
    "每格 scene 必须说明具体场景关系，例如客厅、办公桌、厨房台面、浴室、户外包内、收纳前后等；不能只写棚拍或背景。",
    "visual 必须写出人物在场景里的具体行为、商品在画面里的位置、前后动作连续性和情绪变化；禁止 12 格都是站立指向商品。",
    "camera 必须有镜头变化：近景、半身、中景、过肩、推近、转场、细节 macro、手部操作特写至少混合 4 类。",
    "人物参与规则必须服从导演问答：no_people 表示 12 宫格不出现真人，最终视频也以商品和空间为主；hands_or_back 表示 12 宫格可出现手部/背影/安装动作但不能出现可识别人脸；spokesperson 表示最终视频可有讲解者，但分镜图仍避免清晰人脸。",
    "每一格 frames 都必须有非空 narration；narration 可以重复该时间段绑定的短口播，但绝不能省略、留空或只写‘同上’。",
    "bindings 必须把 4 段口播与 12 宫格分镜绑定起来，每段至少绑定 2-4 个镜头，字段：segmentId、timeRange、narration、frameIndexes、note。",
    "finalPrompt 是给视频生成模型的完整中文提示词，不要输出给用户可编辑版本；必须一次性合并商品多视图、模特建议、分镜绑定、口播时长、比例和连续动作要求。",
    "finalPrompt 中不得写成模板说明，不要暴露内部推理、不要重复提示词结构标签，只保留真正要提交的内容。",
    "要求：生成原创视频，不复制原人物脸、原商品、品牌、Logo、水印或字幕。",
    `商品名称：${input.productName}`,
    `用户描述/卖点：${input.sellingPoints}`,
    `拆分卖点：${input.points.join("、")}`,
    `用户选择口吻：${toneLabels[input.tone]}`,
    `目标时长：${input.duration} 秒`,
    `用户上传商品图数量：${input.productImageCount}`,
    `选中方案：${input.selectedPlan.label || "A"} · ${input.selectedPlan.title || ""}`,
    `方案角度：${input.selectedPlan.angle || ""}`,
    `方案故事弧线：${input.selectedPlan.storyArc || ""}`,
    `方案动作节拍：${Array.isArray(input.selectedPlan.actionBeats) ? input.selectedPlan.actionBeats.join(" | ") : ""}`,
    `方案商品方向：${input.selectedPlan.productDirection || ""}`,
    `方案模特方向：${input.selectedPlan.modelDirection || ""}`,
    `方案内置提示：${input.selectedPlan.internalPrompt || ""}`,
    `方案讲稿：${scriptSegments.map((segment) => segment.narration).join(" | ")}`,
    ...directorLines,
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
    const actionBeats = Array.isArray(plan.actionBeats)
      ? plan.actionBeats.map((beat) => compact(beat, 90)).filter(Boolean).slice(0, 4)
      : [];
    const angle = compact(plan.angle, 120);
    const storyArc = compact(plan.storyArc, 180);
    const modelDirection = compact(plan.modelDirection, 180);
    const productDirection = compact(plan.productDirection, 180);
    const internalPrompt = compact(plan.internalPrompt, 900);
    if (!angle || !storyArc || actionBeats.length !== 4 || !modelDirection || !productDirection || !internalPrompt) {
      throw new Error("LLM 方案缺少故事、动作、多视图或内部提示词");
    }
    return {
      id: `plan-${label.toLowerCase()}`,
      label,
      title: compact(plan.title, 32) || `${label} 方案`,
      angle,
      storyArc,
      actionBeats,
      sellingPointSummary,
      modelDirection,
      productDirection,
      internalPrompt,
      script,
    };
  });
}

function normalizePack(value: unknown, productName: string, duration: Duration, selectedPlan: SelectedPlanInput): VideoPackResult {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const multiview = record.productMultiview && typeof record.productMultiview === "object"
    ? (record.productMultiview as Record<string, unknown>)
    : {};
  const recommendation = record.modelRecommendation && typeof record.modelRecommendation === "object"
    ? (record.modelRecommendation as Record<string, unknown>)
    : {};
  const storyboard = record.storyboard && typeof record.storyboard === "object"
    ? (record.storyboard as Record<string, unknown>)
    : {};
  const rawViews = Array.isArray(multiview.views) ? multiview.views.slice(0, 5) : [];
  const rawFrames = Array.isArray(storyboard.frames)
    ? storyboard.frames.slice(0, 12)
    : Array.isArray(record.storyboard)
      ? record.storyboard.slice(0, 12)
      : [];
  const rawBindings = Array.isArray(record.bindings) ? record.bindings.slice(0, 4) : [];
  if (rawViews.length !== 5) throw new Error("视频任务包必须生成 5 个商品多视图");
  if (rawFrames.length !== 12) throw new Error("视频任务包必须生成 12 宫格分镜");
  if (rawBindings.length !== 4) throw new Error("视频任务包必须生成 4 段文案与分镜绑定");

  const narrationByFrame = new Map<number, string>();
  for (const item of rawBindings) {
    const binding = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const narration = compact(
      binding.narration ?? binding.voiceover ?? binding.dialogue ?? binding.copy,
      80,
    );
    const frameIndexes = Array.isArray(binding.frameIndexes)
      ? binding.frameIndexes.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
      : [];
    if (narration) frameIndexes.forEach((frameIndex) => narrationByFrame.set(frameIndex, narration));
  }
  const selectedScriptSegments = Array.isArray(selectedPlan.script?.segments)
    ? selectedPlan.script.segments
    : [];
  const scriptNarrationForFrame = (index: number) => {
    if (!selectedScriptSegments.length) return "";
    const segmentIndex = Math.min(
      selectedScriptSegments.length - 1,
      Math.floor((index / 12) * selectedScriptSegments.length),
    );
    const segment = selectedScriptSegments[segmentIndex];
    return compact(
      segment && typeof segment === "object"
        ? (segment as Record<string, unknown>).narration
        : "",
      80,
    );
  };

  const viewNames = ["正面", "侧面", "45度", "细节特写", "使用状态"];
  const views = rawViews.map((item, index) => {
    const view = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const prompt = compact(view.prompt, 280);
    if (!prompt) throw new Error("商品多视图提示词缺失");
    return {
      name: compact(view.name, 18) || viewNames[index],
      purpose: compact(view.purpose, 60) || "用于商品多视图参考",
      prompt,
      note: compact(view.note, 120) || "生成后仅用于视频任务内部参考",
    };
  });

  const frames = rawFrames.map((item, index) => {
    const frame = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const visual = compact(
      frame.visual ?? frame.visualDescription ?? frame.description ?? frame.shot ?? frame.action,
      120,
    );
    const camera = compact(
      frame.camera ?? frame.cameraShot ?? frame.shotType ?? frame.framing ?? frame.motion,
      80,
    );
    const narration = compact(
      frame.narration ?? frame.voiceover ?? frame.voiceOver ?? frame.dialogue ?? frame.copy ?? frame.script,
      80,
    ) || narrationByFrame.get(index + 1) || scriptNarrationForFrame(index);
    if (!visual || !camera || !narration) {
      const missing = [!visual && "画面", !camera && "镜头/动作", !narration && "口播"]
        .filter(Boolean)
        .join("、");
      throw new Error(`第 ${index + 1} 格分镜内容缺失：${missing}`);
    }
    return {
      index: index + 1,
      timeRange: compact(frame.timeRange ?? frame.time ?? frame.duration, 24) || `${Math.round((index * duration) / 12)}-${Math.round(((index + 1) * duration) / 12)}秒`,
      scene: compact(frame.scene ?? frame.environment ?? frame.setting ?? frame.context, 70),
      intent: compact(frame.intent ?? frame.purpose ?? frame.storyBeat ?? frame.goal, 70),
      visual,
      camera,
      narration,
      assetUse: compact(frame.assetUse ?? frame.assets ?? frame.reference, 80) || "商品多视图、模特和场景参考",
    };
  });

  const bindings = rawBindings.map((item, index) => {
    const binding = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const frameIndexes = Array.isArray(binding.frameIndexes)
      ? binding.frameIndexes
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
      : [];
    const timeRange = compact(binding.timeRange, 24);
    const narration = compact(binding.narration, 80);
    if (!timeRange || !narration || !frameIndexes.length) throw new Error("文案与分镜绑定缺失");
    return {
      segmentId: compact(binding.segmentId, 40) || `segment-${index + 1}`,
      timeRange,
      narration,
      frameIndexes,
      note: compact(binding.note, 140) || "将对应讲稿和镜头顺序绑定到同一段视频任务中",
    };
  });

  const finalPrompt = text(record.finalPrompt, 5000);
  if (!finalPrompt) throw new Error("最终视频提示词缺失");

  const recommendationMode = ["auto", "asset_library", "blurred_reference"].includes(String(recommendation.mode))
    ? (recommendation.mode as "auto" | "asset_library" | "blurred_reference")
    : "auto";

  return {
    status: "READY",
    draftId: randomUUID(),
    title: compact(record.title, 40) || `${productName} · 视频任务包`,
    selectedPlanId: compact(selectedPlan.id || "selected", 40),
    selectedPlanLabel: compact(selectedPlan.label || "A", 8) || "A",
    productMultiview: {
      summary: compact(multiview.summary, 120) || "商品多视图将自动补全正侧背与细节镜头。",
      views,
    },
    modelRecommendation: {
      mode: recommendationMode,
      label: compact(recommendation.label, 40) || "自动推荐模特方式",
      reason: compact(recommendation.reason, 120) || "系统会根据素材与口播方向自动选择最稳妥的模特策略。",
      maskingAdvice: compact(recommendation.maskingAdvice, 120) || "如出现真人参考，会先进行遮挡或隐私化处理。",
    },
    storyboard: {
      summary: compact(storyboard.summary, 120) || "12 宫格分镜已按口播节奏生成。",
      frames,
    },
    bindings,
    finalPrompt,
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user)
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const traceBody = await request.clone().json().catch(() => null);
  if (traceBody?.mode === "trace") {
    structuredLog("info", "model_spokesperson_stage_trace", {
      ...requestContext(request),
      userId: user.id,
      stage: text(traceBody.stage, 80) || "unknown",
      details: traceBody.details && typeof traceBody.details === "object" ? traceBody.details : {},
    });
    return NextResponse.json({ ok: true });
  }

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
  const directorBrief = body?.directorBrief && typeof body.directorBrief === "object"
    ? (body.directorBrief as DirectorBriefInput)
    : {};
  const mode = body?.mode === "director" || body?.mode === "plans" || body?.mode === "pack" ? body.mode : "script";
  const tone = tones.includes(body?.tone) ? (body.tone as Tone) : "natural";
  const duration = durations.includes(Number(body?.duration) as Duration)
    ? (Number(body.duration) as Duration)
    : 15;
  const requestAssetIds = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 4)
    : [];
  const productImageCount = Math.max(0, Math.min(8, Number(body?.productImageCount) || 0));
  const normalizedProductName = productName || (productImageCount || requestAssetIds.length ? "用户上传商品" : "");
  const points = splitPoints(
    sellingPoints ||
      [
        directorBrief.productUnderstanding,
        directorBrief.audience && `目标用户：${directorBrief.audience}`,
        directorBrief.usageScene && `使用场景：${directorBrief.usageScene}`,
        directorBrief.valueFocus && `价值重点：${directorBrief.valueFocus}`,
      ].filter(Boolean).join("；"),
  );
  const selectedPlan = body?.selectedPlan && typeof body.selectedPlan === "object" ? (body.selectedPlan as SelectedPlanInput) : null;

  if (mode !== "director" && (!normalizedProductName || !points.length)) {
    return NextResponse.json(
      {
        code: "SCRIPT_INPUT_REQUIRED",
        message: "请至少上传商品图，或填写商品名称/一句话描述",
      },
      { status: 400 },
    );
  }

  try {
    if (mode === "director") {
      const assetIds = requestAssetIds;
      if (!assetIds.length && !productName && !sellingPoints) {
        return NextResponse.json(
          { code: "SCRIPT_INPUT_REQUIRED", message: "请先上传商品图，或填写商品名称/一句话描述" },
          { status: 400 },
        );
      }
      const assets = assetIds.length
        ? await db.query<{ id: string; storage_key: string; mime_type: string; original_name: string | null }>(
            "SELECT id, storage_key, mime_type, original_name FROM assets WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND audit_status = 'READY'",
            [assetIds, user.id],
          )
        : { rows: [] };
      const imageUrls = await Promise.all(
        assets.rows
          .filter((asset) => asset.mime_type.startsWith("image/"))
          .slice(0, 4)
          .map((asset) => createSignedObjectUrl(asset.storage_key, "GET", 900)),
      );
      const raw = await callDirectorVision({
        productName,
        sellingPoints,
        imageUrls,
        requestLog: { mode, productName, hasSellingPoints: Boolean(sellingPoints), assetCount: assetIds.length, imageCount: imageUrls.length },
      });
      const analysis = normalizeDirectorBrief(raw, directorBrief);
      await audit(user.id, "MODEL_SPOKESPERSON_DIRECTOR_BRIEF_GENERATED", request, {
        type: "director_brief",
        id: randomUUID(),
      }, {
        productName: analysis.productName || normalizedProductName,
        imageCount: imageUrls.length,
        peopleMode: analysis.directorBrief.peopleMode,
      });
      return NextResponse.json({
        status: "READY",
        provider: "llm",
        ...analysis,
        generatedAt: new Date().toISOString(),
      });
    }

    if (mode === "plans") {
      const raw = await callScriptLLM({
        operation: "model_spokesperson_script_plans",
        prompt: plansPrompt({ productName: normalizedProductName, sellingPoints, points, tone, duration, productImageCount, directorBrief }),
        requestLog: {
          mode,
          productName: normalizedProductName,
          sellingPointCount: points.length,
          tone,
          duration,
          productImageCount,
          directorBrief,
        },
      });
      const plans = normalizePlans(raw, normalizedProductName, duration);
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

    if (mode === "pack") {
      if (!selectedPlan?.script?.segments?.length) {
        return NextResponse.json(
          {
            code: "SCRIPT_INPUT_REQUIRED",
            message: "请先选择一个口播方案再生成视频任务包",
          },
          { status: 400 },
        );
      }
      const raw = await callScriptLLM({
        operation: "model_spokesperson_video_pack",
        prompt: packPrompt({
          productName: normalizedProductName,
          sellingPoints,
          points,
          tone,
          duration,
          productImageCount,
          selectedPlan,
          directorBrief,
        }),
        requestLog: {
          mode,
          productName: normalizedProductName,
          sellingPointCount: points.length,
          tone,
          duration,
          productImageCount,
          selectedPlanId: selectedPlan.id || null,
          selectedPlanLabel: selectedPlan.label || null,
          directorBrief,
        },
      });
      const pack = normalizePack(raw, normalizedProductName, duration, selectedPlan);
      await audit(user.id, "MODEL_SPOKESPERSON_VIDEO_PACK_GENERATED", request, {
        type: "video_pack",
        id: pack.draftId,
      }, {
        duration,
        llmRequired: true,
        selectedPlanId: pack.selectedPlanId,
        viewCount: pack.productMultiview.views.length,
        frameCount: pack.storyboard.frames.length,
        bindingCount: pack.bindings.length,
      });
      return NextResponse.json({
        status: "READY",
        provider: "llm",
        pack,
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
