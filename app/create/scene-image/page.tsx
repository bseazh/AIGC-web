import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { sceneImageWorkflow } from "@/lib/product-config";

export default function SceneImagePage() {
  return <ImageWorkflowPage title="场景图生成" description="一次生成 4 张，消耗 10 积分" submitUrl="/api/tasks/scene/" scenes={sceneImageWorkflow.scenes} styles={sceneImageWorkflow.styles} sourceTitle="上传商品图片" sourceHint="JPG、PNG、WebP，最大 10MB" />;
}
