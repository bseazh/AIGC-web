import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { hdEnhanceWorkflow } from "@/lib/product-config";

export default function HdEnhancePage() {
  return <ImageWorkflowPage
    title="高清优化"
    description="单张输出，消耗 5 积分"
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
  />;
}
