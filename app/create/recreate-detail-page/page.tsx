export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { recreateDetailCases } from "@/lib/image-workflow-cases";
import { recreateDetailWorkflow } from "@/lib/product-config";
export default function Page() { return <ProjectRequiredGate workflowKey="recreate-detail-page"><ImageWorkflowPage title="复刻商详页" description="参考卖点结构生成原创详情页视觉，默认 1 张，消耗 10 积分" submitUrl="/api/tasks/recreate-detail-page/" scenes={recreateDetailWorkflow.scenes} styles={recreateDetailWorkflow.styles} sourceTitle="上传参考商品图" sourceHint="仅提取版式与节奏，不复制原图内容" submitLabel="生成原创商详页" cases={recreateDetailCases} productDescriptionLabel="复刻方向" productDescriptionPlaceholder="说明商品卖点，以及希望参考的详情页模块顺序和视觉节奏" /></ProjectRequiredGate>; }
