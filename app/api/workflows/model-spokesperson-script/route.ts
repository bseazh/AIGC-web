import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { redis } from "@/lib/redis";
import { authenticatedUser } from "@/lib/session";

const tones = ["natural", "enthusiastic", "professional"] as const;
const durations = [15, 30, 60] as const;

type Tone = (typeof tones)[number];
type Duration = (typeof durations)[number];
type Segment = {
  id: string;
  stage: string;
  timeRange: string;
  narration: string;
  visual: string;
};

const toneCopy: Record<
  Tone,
  { label: string; openers: string[]; transition: string; closing: string }
> = {
  natural: {
    label: "自然亲和",
    openers: [
      "最近发现了一个很实用的好物",
      "如果你也在认真挑选日常好物，可以看看这个",
      "今天想和大家分享一个使用起来很省心的产品",
    ],
    transition: "我实际关注下来，比较打动我的是",
    closing: "如果这些特点正好符合你的需求，可以进一步了解一下",
  },
  enthusiastic: {
    label: "热情带货",
    openers: [
      "姐妹们，这个好物真的值得认真看一下",
      "还没找到合适产品的朋友，先别划走",
      "今天给大家带来一个非常有吸引力的选择",
    ],
    transition: "它最让我惊喜的地方就是",
    closing: "喜欢的朋友可以马上去了解，别错过适合自己的选择",
  },
  professional: {
    label: "专业讲解",
    openers: [
      "选择产品时，真正值得关注的是使用价值和核心细节",
      "今天从实际需求出发，为大家介绍一款产品",
      "判断一款产品是否值得选择，可以先看它的核心优势",
    ],
    transition: "从产品表现来看，它的重点优势包括",
    closing: "建议结合自己的使用场景进一步了解并理性选择",
  },
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
    .slice(0, 6);
}

function choose(values: string[], productName: string, variant: number) {
  const seed = [...productName].reduce(
    (total, character) => total + character.charCodeAt(0),
    Math.max(0, variant),
  );
  return values[seed % values.length];
}

function joinPoints(points: string[], limit: number) {
  return points
    .slice(0, limit)
    .map((point, index) => `${index ? "另外，" : ""}${point}`)
    .join("；");
}

function createSegments(input: {
  productName: string;
  points: string[];
  audience: string;
  usageScene: string;
  callToAction: string;
  tone: Tone;
  duration: Duration;
  variant: number;
}): Segment[] {
  const copy = toneCopy[input.tone];
  const opener = choose(copy.openers, input.productName, input.variant);
  const audience = input.audience ? `，尤其适合${input.audience}` : "";
  const scene = input.usageScene ? `在${input.usageScene}时` : "日常使用时";
  const closing = input.callToAction || copy.closing;
  const primary = joinPoints(input.points, input.duration === 15 ? 2 : 3);
  const secondary = joinPoints(input.points.slice(3), 3);

  if (input.duration === 15) {
    return [
      {
        id: randomUUID(),
        stage: "开场吸引",
        timeRange: "0–3 秒",
        narration: `${opener}——${input.productName}。`,
        visual: "模特半身正面出镜，快速建立视线交流。",
      },
      {
        id: randomUUID(),
        stage: "核心卖点",
        timeRange: "3–10 秒",
        narration: `${copy.transition}：${primary}${audience}。`,
        visual: "模特口播与商品特写交替，卖点关键词同步上屏。",
      },
      {
        id: randomUUID(),
        stage: "使用场景",
        timeRange: "10–13 秒",
        narration: `${scene}，它能让整个体验更轻松、更顺手。`,
        visual: "展示商品使用场景或细节动作。",
      },
      {
        id: randomUUID(),
        stage: "行动引导",
        timeRange: "13–15 秒",
        narration: `${closing}。`,
        visual: "模特回到正面，商品名称和行动提示出现。",
      },
    ];
  }

  const base: Segment[] = [
    {
      id: randomUUID(),
      stage: "开场吸引",
      timeRange: input.duration === 30 ? "0–4 秒" : "0–6 秒",
      narration: `${opener}，它就是${input.productName}${audience}。`,
      visual: "模特半身近景开场，商品放在画面侧前方。",
    },
    {
      id: randomUUID(),
      stage: "需求共鸣",
      timeRange: input.duration === 30 ? "4–9 秒" : "6–15 秒",
      narration: `很多人在选择这类产品时，既希望好用，也在意细节和实际体验。`,
      visual: "模特自然口播，搭配用户需求关键词字幕。",
    },
    {
      id: randomUUID(),
      stage: "卖点讲解",
      timeRange: input.duration === 30 ? "9–20 秒" : "15–35 秒",
      narration: `${copy.transition}：${primary}。这些特点不是简单堆砌，而是直接服务于真实使用需求。`,
      visual: "依次穿插商品全景、材质和功能细节。",
    },
  ];

  if (input.duration === 60) {
    base.push({
      id: randomUUID(),
      stage: "补充优势",
      timeRange: "35–46 秒",
      narration: secondary
        ? `除此之外，${secondary}。整体考虑会更加完整。`
        : `它在细节处理和日常适配方面也比较均衡，使用起来没有太多负担。`,
      visual: "补充展示包装、操作方式或不同角度。",
    });
  }

  base.push(
    {
      id: randomUUID(),
      stage: "场景说明",
      timeRange: input.duration === 30 ? "20–26 秒" : "46–55 秒",
      narration: `${scene}，它能帮助你减少不必要的麻烦，让使用过程更自然顺畅。`,
      visual: "切换到真实使用场景，保留模特画外音。",
    },
    {
      id: randomUUID(),
      stage: "行动引导",
      timeRange: input.duration === 30 ? "26–30 秒" : "55–60 秒",
      narration: `${closing}。`,
      visual: "模特与商品同框收尾，显示商品名称和行动提示。",
    },
  );
  return base;
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
  const sellingPoints = text(body?.sellingPoints, 800);
  const audience = text(body?.audience, 120);
  const usageScene = text(body?.usageScene, 120);
  const callToAction = text(body?.callToAction, 100);
  const tone = tones.includes(body?.tone) ? (body.tone as Tone) : "natural";
  const duration = durations.includes(Number(body?.duration) as Duration)
    ? (Number(body.duration) as Duration)
    : 15;
  const variant = Number.isFinite(Number(body?.variant))
    ? Math.max(0, Math.floor(Number(body.variant)))
    : 0;
  const points = splitPoints(sellingPoints);

  if (!productName || !points.length) {
    return NextResponse.json(
      {
        code: "SCRIPT_INPUT_REQUIRED",
        message: "请填写商品名称和至少一个核心卖点",
      },
      { status: 400 },
    );
  }

  const segments = createSegments({
    productName,
    points,
    audience,
    usageScene,
    callToAction,
    tone,
    duration,
    variant,
  });
  const fullScript = segments.map((segment) => segment.narration).join("\n");
  const draftId = randomUUID();
  await audit(user.id, "MODEL_SPOKESPERSON_SCRIPT_GENERATED", request, {
    type: "script_draft",
    id: draftId,
  }, {
    duration,
    tone,
    segmentCount: segments.length,
    characterCount: fullScript.replace(/\s/g, "").length,
  });

  return NextResponse.json({
    status: "READY",
    draftId,
    title: `${productName} · ${duration} 秒${toneCopy[tone].label}口播稿`,
    durationSeconds: duration,
    tone: toneCopy[tone].label,
    segments,
    fullScript,
    alternativeOpeners: toneCopy[tone].openers.filter(
      (item) => !segments[0].narration.startsWith(item),
    ),
    generatedAt: new Date().toISOString(),
  });
}
