import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { detailPageWorkflow } from "@/lib/product-config";

export default function ProductDetailPage() {
  return <ImageWorkflowPage
    title="商品详情长图"
    description="从一张主图拆分生成 5 张商品特性详情长图，消耗 10 积分"
    submitUrl="/api/tasks/product-detail/"
    scenes={detailPageWorkflow.scenes}
    styles={detailPageWorkflow.styles}
    sourceTitle="上传或选择商品主图"
    sourceHint="可直接引用主图生成结果；JPG、PNG、WebP，最大 10MB"
    submitLabel="生成 5 张详情长图"
    pointsPerTask={detailPageWorkflow.pointsPerTask}
    outputCount={detailPageWorkflow.outputsPerTask}
    showAspectRatio={false}
    defaultRatio="9:16"
  />;
}
