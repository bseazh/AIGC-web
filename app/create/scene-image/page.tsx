export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { productSceneCases } from "@/lib/image-workflow-cases";
import { sceneImageWorkflow } from "@/lib/product-config";

export default function SceneImagePage() {
  return <ProjectRequiredGate workflowKey="scene-image"><ImageWorkflowPage title="生成产品场景图" description="上传商品图生成场景图，一次 4 张，消耗 10 积分" submitUrl="/api/tasks/scene/" scenes={sceneImageWorkflow.scenes} styles={sceneImageWorkflow.styles} sourceTitle="上传商品图片" sourceHint="JPG、PNG、WebP，最大 10MB" submitLabel="生成场景图" productDescriptionLabel="产品描述" productDescriptionPlaceholder="填写商品名称、材质、卖点、适用人群和使用场景" cases={productSceneCases} /></ProjectRequiredGate>;
}
