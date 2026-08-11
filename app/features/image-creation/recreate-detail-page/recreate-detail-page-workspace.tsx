"use client";

import { DetailPageStudio } from "@/app/features/image-creation/detail-page/detail-page-studio";
import { recreateDetailCases } from "@/lib/image-workflow-cases";
import { recreateDetailWorkflow } from "@/lib/product-config";

export function RecreateDetailPageWorkspace() {
  return (
    <DetailPageStudio
      workflowKey="recreate-detail-page"
      title="复刻商详页"
      description="先拆解商品与参考节奏，再生成可逐张编辑的原创详情页卡片"
      submitUrl="/api/tasks/recreate-detail-page/"
      sourceTitle="上传参考商品图"
      sourceHint="仅提取版式与节奏，不复制原图内容"
      cases={recreateDetailCases}
      productDescriptionLabel="商品与复刻方向"
      productDescriptionPlaceholder="说明当前商品卖点，以及希望参考的模块顺序和视觉节奏"
      pointsPerTask={recreateDetailWorkflow.pointsPerTask}
    />
  );
}
