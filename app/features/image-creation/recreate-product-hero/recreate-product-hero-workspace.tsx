"use client";

import { ImageWorkflowPage } from "@/app/features/image-creation/shared/image-workflow-page";
import { recreateHeroCases } from "@/lib/image-workflow-cases";

export function RecreateProductHeroWorkspace() {
  return (
    <ImageWorkflowPage
      title="复刻商品主图"
      description="参考构图生成原创商品主图，默认 1 张，消耗 10 积分"
      submitUrl="/api/tasks/recreate-product-hero/"
      sourceTitle="上传参考商品图"
      sourceHint="仅用于提取构图和视觉方向，不复制原图内容"
      submitLabel="生成原创主图"
      cases={recreateHeroCases}
      productDescriptionLabel="复刻方向"
      productDescriptionPlaceholder="说明上传商品和希望参考的版式、留白、光影方向"
    />
  );
}
