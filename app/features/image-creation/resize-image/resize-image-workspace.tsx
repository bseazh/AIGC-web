"use client";

import { ImageWorkflowPage } from "@/app/features/image-creation/shared/image-workflow-page";
import { resizeImageCases } from "@/lib/image-workflow-cases";
import { resizeImageWorkflow } from "@/lib/product-config";

export function ResizeImageWorkspace() {
  return (
    <ImageWorkflowPage
      title="图片比例调整"
      description="智能扩展画面并保持商品主体，默认生成 1 张，消耗 5 积分"
      submitUrl="/api/tasks/resize-image/"
      sourceTitle="上传待调整图片"
      sourceHint="支持常用电商比例，最大 10MB"
      submitLabel="调整图片比例"
      pointsPerTask={resizeImageWorkflow.pointsPerTask}
      outputCount={resizeImageWorkflow.outputsPerTask}
      cases={resizeImageCases}
      productDescriptionLabel="扩图要求"
      productDescriptionPlaceholder="填写目标平台比例、背景延展方向、主体保留要求"
    />
  );
}
