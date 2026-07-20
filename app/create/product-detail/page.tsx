import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { detailPageWorkflow } from "@/lib/product-config";

export default function ProductDetailPage() {
  return <ImageWorkflowPage
    title="商品详情页"
    description="生成 4 张详情页视觉，消耗 10 积分"
    submitUrl="/api/tasks/product-detail/"
    scenes={detailPageWorkflow.scenes}
    styles={detailPageWorkflow.styles}
    sourceTitle="上传商品图片"
    sourceHint="JPG、PNG、WebP，最大 10MB"
    submitLabel="生成详情页套图"
    pointsPerTask={detailPageWorkflow.pointsPerTask}
    outputCount={detailPageWorkflow.outputsPerTask}
  />;
}
