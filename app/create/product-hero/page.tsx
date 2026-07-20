import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { heroImageWorkflow } from "@/lib/product-config";

export default function ProductHeroPage() {
  return <ImageWorkflowPage title="商品主图" description="一次生成 4 张，消耗 10 积分" submitUrl="/api/tasks/" scenes={heroImageWorkflow.scenes} styles={heroImageWorkflow.styles} sourceTitle="上传商品图片" sourceHint="JPG、PNG、WebP，最大 10MB" />;
}
