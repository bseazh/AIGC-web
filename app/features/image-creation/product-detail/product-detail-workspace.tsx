"use client";

import { DetailPageStudio } from "@/app/features/image-creation/detail-page/detail-page-studio";
import { productDetailCases } from "@/lib/image-workflow-cases";
import { detailPageWorkflow } from "@/lib/product-config";

export function ProductDetailWorkspace() {
  return (
    <DetailPageStudio
      workflowKey="product-detail-page"
      title="商品详情长图"
      description="先策划详情页结构和文案，再按卡片逐张生成完整商品展示套图"
      submitUrl="/api/tasks/product-detail/"
      sourceTitle="上传或选择商品主图"
      sourceHint="可直接引用主图生成结果；JPG、PNG、WebP，最大 10MB"
      pointsPerTask={detailPageWorkflow.pointsPerTask}
      cases={productDetailCases}
      productDescriptionLabel="商品信息"
      productDescriptionPlaceholder="填写商品品类、核心卖点、材质和详情页重点"
    />
  );
}
