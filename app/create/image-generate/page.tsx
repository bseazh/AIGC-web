export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { aiImageCases } from "@/lib/image-workflow-cases";
import { imageGenerateWorkflow } from "@/lib/product-config";

export default function ImageGeneratePage() {
  return (
    <ProjectRequiredGate workflowKey="image-generate">
      <ImageWorkflowPage
        title="AI生图"
        description="输入提示词生成 4 张图片，消耗 10 积分"
        submitUrl="/api/tasks/image-generate/"
        scenes={imageGenerateWorkflow.scenes}
        styles={imageGenerateWorkflow.styles}
        sourceTitle="提示词生图"
        sourceHint="无需上传素材"
        submitLabel="立即生成"
        requireSource={false}
        cases={aiImageCases}
      />
    </ProjectRequiredGate>
  );
}
