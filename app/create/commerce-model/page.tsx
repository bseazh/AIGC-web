export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { commerceModelCases } from "@/lib/image-workflow-cases";
import { imageGenerateWorkflow } from "@/lib/product-config";

export default function CommerceModelPage() {
  return (
    <ProjectRequiredGate workflowKey="commerce-model">
      <ImageWorkflowPage
        title="带货模特"
        description="生成可复用带货模特资产，默认 1 张，可自定义生成数量"
        submitUrl="/api/tasks/commerce-model/"
        scenes={imageGenerateWorkflow.scenes}
        styles={imageGenerateWorkflow.styles}
        sourceTitle="可选上传参考图"
        sourceHint="不上传也可以直接按提示词生成模特资产"
        submitLabel="生成带货模特"
        requireSource={false}
        defaultRatio="3:4"
        cases={commerceModelCases}
        productDescriptionLabel="模特定位"
        productDescriptionPlaceholder="填写适用商品、人群、风格、年龄感、拍摄场景等"
      />
    </ProjectRequiredGate>
  );
}
