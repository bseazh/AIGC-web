"use client";

import { ImageWorkflowPage } from "@/app/features/image-creation/shared/image-workflow-page";
import { productHeroCases } from "@/lib/image-workflow-cases";

export function ProductHeroWorkspace() {
  return (
    <ImageWorkflowPage
      title="商品主图"
      description="默认生成 1 张，可自定义生成数量，消耗 10 积分"
      submitUrl="/api/tasks/"
      sourceTitle="上传商品图片"
      sourceHint="JPG、PNG、WebP，最大 10MB"
      submitLabel="生成商品主图"
      nextStepHref="/create/product-detail"
      nextStepLabel="用此图生成详情页"
      cases={productHeroCases}
      productDescriptionLabel="商品信息"
    />
  );
}
