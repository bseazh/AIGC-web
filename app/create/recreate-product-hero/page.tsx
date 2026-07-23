import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { recreateHeroWorkflow } from "@/lib/product-config";
export default function Page() { return <ImageWorkflowPage title="复刻商品主图" description="参考构图生成原创商品主图，一次 4 张，消耗 10 积分" submitUrl="/api/tasks/recreate-product-hero/" scenes={recreateHeroWorkflow.scenes} styles={recreateHeroWorkflow.styles} sourceTitle="上传参考商品图" sourceHint="仅用于提取构图和视觉方向，不复制原图内容" submitLabel="生成原创主图" />; }
