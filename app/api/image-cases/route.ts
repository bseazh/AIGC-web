import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { authenticatedUser } from "@/lib/session";

type RemakeItem = {
  id: string;
  configKey: string;
  caseId: string;
  title: string;
  role: "result" | "reference" | "product" | "other";
  order: number;
  status: string;
  storageKey?: string;
  aspectRatio?: string;
};

const workflowConfigs: Record<string, string[]> = {
  "image-generate": ["image_generate_demo"],
  "scene-image": ["product_scene_image_demo"],
  "commerce-model": ["create_model_demo"],
  "model-wear": ["model_wear_demo"],
  "product-hero-image": ["product_main_detail_demo"],
  "product-detail-page": ["product_main_detail_demo", "detail_page_baihuo_demo"],
  "recreate-detail-page": ["detail_page_demo"],
  "recreate-product-hero": ["main_image_demo"],
  "resize-image": ["image_transform_demo"],
  "white-background": ["image_baidi_tiqu"],
  "hd-enhance": ["image_enhance_demo"],
};

const tags: Record<string, string> = {
  image_generate_demo: "AI 创意生图",
  product_scene_image_demo: "商品场景图",
  create_model_demo: "带货模特",
  model_wear_demo: "模特穿搭",
  product_main_detail_demo: "商品套图",
  detail_page_baihuo_demo: "百货详情页",
  detail_page_demo: "复刻商详",
  main_image_demo: "复刻主图",
  image_transform_demo: "调整比例",
  image_baidi_tiqu: "白底图",
  image_enhance_demo: "高清优化",
};

// Keep generated case manifests outside the Next build trace. Production keeps this
// directory on the persistent host volume while local development can override it.
const caseDataRoot = process.env.CASE_REMAKE_ROOT || "/home/ubuntu/project/AIGC_web/data";

function textFromParameters(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string") return /^https?:\/\//.test(value) ? [] : [value.trim()];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => textFromParameters(item, depth + 1));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap((item) => textFromParameters(item, depth + 1));
  return [];
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const workflowKey = request.nextUrl.searchParams.get("workflowKey") || "";
  const configKeys = workflowConfigs[workflowKey];
  if (!configKeys) return NextResponse.json({ cases: [] });

  try {
    const manifest = JSON.parse(await readFile(join(caseDataRoot, "image-case-remakes", "manifest.json"), "utf8")) as { items?: RemakeItem[] };
    const completed = (manifest.items || []).filter((item) => item.status === "succeeded" && item.storageKey && configKeys.includes(item.configKey));
    const groups = new Map<string, RemakeItem[]>();
    for (const item of completed) groups.set(item.caseId, [...(groups.get(item.caseId) || []), item]);

    const sourceCases = new Map<string, Record<string, unknown>>();
    for (const configKey of configKeys) {
      const source = JSON.parse(await readFile(join(caseDataRoot, "yinghai-cases", `${configKey}.json`), "utf8")) as { cases?: Array<Record<string, unknown>> };
      for (const item of source.cases || []) sourceCases.set(String(item.id), item);
    }

    const cases = await Promise.all([...groups.entries()].flatMap(([caseId, items]) => {
      const results = items.filter((item) => item.role === "result").sort((a, b) => a.order - b.order);
      if (!results.length) return [];
      const source = sourceCases.get(caseId) || {};
      return [Promise.all(items.map(async (item) => ({ item, url: await createSignedObjectUrl(item.storageKey as string, "GET", 3600) }))).then((signed) => {
        const urls = new Map(signed.map(({ item, url }) => [item.id, url]));
        const references = items.filter((item) => item.role !== "result").sort((a, b) => a.order - b.order);
        const parameters = (source.parameters && typeof source.parameters === "object" ? source.parameters : {}) as Record<string, unknown>;
        const description = textFromParameters(parameters).filter(Boolean).slice(0, 5).join("；").slice(0, 900);
        return {
          id: `remake-${caseId}`,
          title: String(source.title || results[0].title || "原创案例"),
          tag: tags[results[0].configKey] || "图片案例",
          image: urls.get(results[0].id),
          images: results.map((item) => urls.get(item.id)).filter(Boolean),
          referenceImages: references.map((item, index) => ({ image: urls.get(item.id), label: item.role === "product" ? `原创商品素材 ${index + 1}` : item.role === "reference" ? `原创参考素材 ${index + 1}` : `原创辅助素材 ${index + 1}` })).filter((item) => item.image),
          prompt: "使用当前用户上传的商品或人物素材，参考本案例的构图层级、镜头节奏和商业用途生成原创图片；不要复制案例中的人物、商品、品牌或文字。",
          productDescription: description || "参考案例的信息层级和视觉节奏，使用当前素材重新创作。",
          ratio: results[0].aspectRatio || "1:1",
          model: "Gemini 2.5 Flash Image",
          quality: "1K",
          parameters: [{ label: "案例来源", value: "Gemini 原创重生成" }, { label: "套图数量", value: `${results.length} 张` }],
        };
      })];
    }));
    return NextResponse.json({ cases });
  } catch {
    return NextResponse.json({ cases: [] });
  }
}
