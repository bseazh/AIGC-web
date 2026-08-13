export type ImageWorkflowKind = "creative" | "series" | "transform" | "model";
export type ImageWorkflowOutput = "single" | "multiple" | "cards";
export type ImageAssistantMode = "creative" | "detail" | "transform" | "model";

export type ImageWorkflowSpec = {
  key: string;
  label: string;
  kind: ImageWorkflowKind;
  assistantMode: ImageAssistantMode;
  output: ImageWorkflowOutput;
  requiresSource: boolean;
  supportsReferences: boolean;
  supportsSeries: boolean;
  preservesProduct: boolean;
  description: string;
  caseDetails: {
    referenceLabel: string;
    descriptionLabel: string;
    inputRoles: string[];
  };
};

const caseDetails = (referenceLabel: string, descriptionLabel: string, inputRoles: string[]) => ({ referenceLabel, descriptionLabel, inputRoles });

export const imageWorkflowSpecs: Record<string, ImageWorkflowSpec> = {
  "image-generate": { key: "image-generate", label: "AI 创意生图", kind: "creative", assistantMode: "creative", output: "single", requiresSource: false, supportsReferences: true, supportsSeries: true, preservesProduct: false, description: "从想法或参考图生成新的画面", caseDetails: caseDetails("效果参考图", "提示词", ["参考图片（可选）", "提示词", "模型", "画质", "比例"]) },
  "product-hero-image": { key: "product-hero-image", label: "商品主图", kind: "creative", assistantMode: "creative", output: "single", requiresSource: true, supportsReferences: true, supportsSeries: false, preservesProduct: true, description: "突出商品主体、卖点和首屏识别", caseDetails: caseDetails("效果参考图", "商品信息", ["商品图", "商品信息", "模型", "画质", "比例"]) },
  "scene-image": { key: "scene-image", label: "商品场景图", kind: "creative", assistantMode: "creative", output: "multiple", requiresSource: true, supportsReferences: true, supportsSeries: true, preservesProduct: true, description: "把商品放入可信的使用环境并保持结构", caseDetails: caseDetails("效果参考图", "产品描述", ["产品图片", "产品描述", "指定模特图（可选）", "模型", "画质", "比例"]) },
  "commerce-model": { key: "commerce-model", label: "带货模特", kind: "model", assistantMode: "model", output: "single", requiresSource: false, supportsReferences: true, supportsSeries: false, preservesProduct: true, description: "让人物展示、拿取或使用商品", caseDetails: caseDetails("人物效果参考", "模特定位", ["商品或人物参考（可选）", "模特定位", "模型", "画质", "比例"]) },
  "model-wear": { key: "model-wear", label: "模特穿搭", kind: "model", assistantMode: "model", output: "multiple", requiresSource: true, supportsReferences: true, supportsSeries: true, preservesProduct: true, description: "保持人物与商品结构，展示上身效果", caseDetails: caseDetails("穿搭效果参考", "穿搭要求", ["模特图", "商品图（多颜色）", "模型", "画质", "比例"]) },
  "product-detail-page": { key: "product-detail-page", label: "商品详情页", kind: "series", assistantMode: "detail", output: "cards", requiresSource: true, supportsReferences: true, supportsSeries: true, preservesProduct: true, description: "按统一视觉基准组织多张卖点详情卡片", caseDetails: caseDetails("套图效果参考", "商品信息", ["商品图（最多 10 张）", "商品信息", "模型", "画质", "比例"]) },
  "recreate-product-hero": { key: "recreate-product-hero", label: "复刻商品主图", kind: "creative", assistantMode: "creative", output: "single", requiresSource: true, supportsReferences: true, supportsSeries: false, preservesProduct: true, description: "参考构图和光影，生成原创商品主图", caseDetails: caseDetails("改版效果参考", "商品描述", ["商品图", "对标主图", "模特图（可选）", "商品描述", "模型", "画质", "比例"]) },
  "recreate-detail-page": { key: "recreate-detail-page", label: "复刻商详页", kind: "series", assistantMode: "detail", output: "cards", requiresSource: true, supportsReferences: true, supportsSeries: true, preservesProduct: true, description: "参考版式节奏，生成原创详情页系列", caseDetails: caseDetails("套图效果参考", "商品描述", ["竞品参考图（最多 10 张）", "商品图（最多 10 张）", "模特图（可选）", "商品描述", "模型", "画质", "比例"]) },
  "white-background": { key: "white-background", label: "白底图", kind: "transform", assistantMode: "transform", output: "single", requiresSource: true, supportsReferences: false, supportsSeries: false, preservesProduct: true, description: "清理背景、保留主体边缘和自然阴影", caseDetails: caseDetails("处理效果参考", "处理目标", ["商品平铺图", "商品品类", "模型", "画质"]) },
  "hd-enhance": { key: "hd-enhance", label: "高清优化", kind: "transform", assistantMode: "transform", output: "single", requiresSource: true, supportsReferences: false, supportsSeries: false, preservesProduct: true, description: "提升清晰度并恢复材质细节，不重新设计商品", caseDetails: caseDetails("增强效果参考", "增强目标", ["商品正面主图", "商品细节/辅助图（可选）", "模型", "目标画质", "比例"]) },
  "resize-image": { key: "resize-image", label: "调整比例", kind: "transform", assistantMode: "transform", output: "single", requiresSource: true, supportsReferences: false, supportsSeries: false, preservesProduct: true, description: "扩展画布比例，保持主体不裁切不拉伸", caseDetails: caseDetails("扩图效果参考", "处理目标", ["商品主图", "模型", "画质", "目标比例"]) },
};

export function getImageWorkflowSpec(key: string | undefined): ImageWorkflowSpec {
  return imageWorkflowSpecs[key || "image-generate"] || imageWorkflowSpecs["image-generate"];
}

export function defaultAssistantSeriesConfig(key: string | undefined) {
  const spec = getImageWorkflowSpec(key);
  const count = spec.output === "cards" ? 4 : spec.output === "multiple" ? 2 : 1;
  return {
    count: count as 1 | 2 | 4,
    unifiedStyle: spec.kind !== "transform",
    unifiedBackground: spec.kind !== "transform",
    preserveProduct: true as const,
    reserveCopySpace: spec.kind === "series",
    differentAngles: spec.supportsSeries,
    ratio: "auto",
  };
}

export function assistantOutputCounts(key: string | undefined): Array<1 | 2 | 4 | 6 | 8> {
  const spec = getImageWorkflowSpec(key);
  if (spec.output === "cards") return [4, 6, 8];
  if (!spec.supportsSeries || spec.kind === "transform") return [1];
  return [1, 2, 4];
}
