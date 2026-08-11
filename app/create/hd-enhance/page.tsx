export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { hdEnhanceCases } from "@/lib/image-workflow-cases";
import { hdEnhanceWorkflow } from "@/lib/product-config";

export default function HdEnhancePage() {
  return <ProjectRequiredGate workflowKey="hd-enhance"><ImageWorkflowPage
    title="高清优化"
    description="默认生成 1 张，可自定义生成数量，消耗 5 积分"
    submitUrl="/api/tasks/hd-enhance/"
    scenes={hdEnhanceWorkflow.scenes}
    styles={hdEnhanceWorkflow.styles}
    sourceTitle="上传待优化图片"
    sourceHint="JPG、PNG、WebP，最大 10MB"
    submitLabel="开始高清优化"
    pointsPerTask={hdEnhanceWorkflow.pointsPerTask}
    outputCount={hdEnhanceWorkflow.outputsPerTask}
    showAspectRatio={false}
    sceneLabel="放大倍率"
    styleLabel="优化策略"
    cases={hdEnhanceCases}
    productDescriptionLabel="优化要求"
    productDescriptionPlaceholder="填写需要增强的边缘、纹理、材质、噪点或清晰度要求"
  /></ProjectRequiredGate>;
}
