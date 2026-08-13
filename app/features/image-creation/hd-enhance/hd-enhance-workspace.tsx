"use client";

import { ImageWorkflowPage } from "@/app/features/image-creation/shared/image-workflow-page";
import { hdEnhanceCases } from "@/lib/image-workflow-cases";
import { hdEnhanceWorkflow } from "@/lib/product-config";

export function HdEnhanceWorkspace() {
  return (
    <ImageWorkflowPage
      workflowKey="hd-enhance"
      title="高清优化"
      description="默认生成 1 张，可自定义生成数量，消耗 5 积分"
      submitUrl="/api/tasks/hd-enhance/"
      sourceTitle="上传待优化图片"
      sourceHint="JPG、PNG、WebP，最大 10MB"
      submitLabel="开始高清优化"
      pointsPerTask={hdEnhanceWorkflow.pointsPerTask}
      outputCount={hdEnhanceWorkflow.outputsPerTask}
      showAspectRatio={false}
      cases={hdEnhanceCases}
      productDescriptionLabel="优化要求"
      productDescriptionPlaceholder="填写需要增强的边缘、纹理、材质、噪点或清晰度要求"
    />
  );
}
