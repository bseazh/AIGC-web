"use client";

import { ImageWorkflowPage } from "@/app/features/image-creation/shared/image-workflow-page";
import { whiteBackgroundCases } from "@/lib/image-workflow-cases";
import { whiteBackgroundWorkflow } from "@/lib/product-config";

export function WhiteBackgroundWorkspace() {
  return (
    <ImageWorkflowPage
      workflowKey="white-background"
      title="白底图生成"
      description="默认生成 1 张，可自定义生成数量，消耗 5 积分"
      submitUrl="/api/tasks/white-background/"
      sourceTitle="上传商品图片"
      sourceHint="保留商品主体，自动生成电商白底图"
      submitLabel="生成白底图"
      pointsPerTask={whiteBackgroundWorkflow.pointsPerTask}
      cases={whiteBackgroundCases}
      productDescriptionLabel="处理要求"
      productDescriptionPlaceholder="填写需要保留的商品细节、阴影和平台白底规范"
    />
  );
}
