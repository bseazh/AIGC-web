import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { recreateDetailWorkflow } from "@/lib/product-config";
export default function Page() { return <ImageWorkflowPage title="复刻商详页" description="参考卖点结构生成原创详情页视觉，消耗 10 积分" submitUrl="/api/tasks/recreate-detail-page/" scenes={recreateDetailWorkflow.scenes} styles={recreateDetailWorkflow.styles} sourceTitle="上传参考商品图" sourceHint="仅提取版式与节奏，不复制原图内容" submitLabel="生成原创商详页" outputCount={5} />; }
