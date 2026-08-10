import type { ImageAssistantWorkflowKey } from "./types";

export const imageAssistantWorkflows: Record<ImageAssistantWorkflowKey, { label: string; description: string }> = {
  "image-generate": { label: "AI 创意生图", description: "从想法生成完整画面" },
  "product-hero-image": { label: "商品主图", description: "突出商品和购买理由" },
  "scene-image": { label: "商品场景图", description: "把商品放进真实使用场景" },
  "commerce-model": { label: "带货模特", description: "生成适合商品的商业模特" },
  "model-wear": { label: "模特穿搭", description: "规划商品上身和展示方式" },
  "product-detail-page": { label: "商品详情页", description: "组织卖点、细节与场景" },
  "recreate-product-hero": { label: "复刻商品主图", description: "学习参考图的构图和光影" },
  "recreate-detail-page": { label: "复刻商详页", description: "学习参考页面的视觉节奏" },
  "white-background": { label: "白底图", description: "保持商品真实并清理背景" },
  "hd-enhance": { label: "高清优化", description: "修复清晰度和材质细节" },
  "resize-image": { label: "调整比例", description: "扩展背景并保持主体" },
};

export const imageAssistantWorkflowKeys = Object.keys(imageAssistantWorkflows) as ImageAssistantWorkflowKey[];

export function isImageAssistantWorkflow(value: unknown): value is ImageAssistantWorkflowKey {
  return typeof value === "string" && value in imageAssistantWorkflows;
}
