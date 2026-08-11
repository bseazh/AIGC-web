export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { productDetailCases } from "@/lib/image-workflow-cases";
import { detailPageWorkflow } from "@/lib/product-config";

export default function ProductDetailPage() {
  return <ProjectRequiredGate workflowKey="product-detail-page"><ImageWorkflowPage
    title="商品详情长图"
    description="从主图生成商品特性详情长图，默认 1 张，消耗 10 积分"
    submitUrl="/api/tasks/product-detail/"
    scenes={detailPageWorkflow.scenes}
    styles={detailPageWorkflow.styles}
    sourceTitle="上传或选择商品主图"
    sourceHint="可直接引用主图生成结果；JPG、PNG、WebP，最大 10MB"
    submitLabel="生成详情长图"
    pointsPerTask={detailPageWorkflow.pointsPerTask}
    outputCount={detailPageWorkflow.outputsPerTask}
    showAspectRatio={false}
    defaultRatio="9:16"
    cases={productDetailCases}
    productDescriptionLabel="商品信息"
    productDescriptionPlaceholder="填写商品品类、核心卖点、材质、使用场景和详情页重点"
  /></ProjectRequiredGate>;
}
