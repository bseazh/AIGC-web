export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { whiteBackgroundCases } from "@/lib/image-workflow-cases";
import { whiteBackgroundWorkflow } from "@/lib/product-config";
export default function Page() { return <ProjectRequiredGate workflowKey="white-background"><ImageWorkflowPage title="白底图生成" description="一次生成 4 张，消耗 5 积分" submitUrl="/api/tasks/white-background/" scenes={whiteBackgroundWorkflow.scenes} styles={whiteBackgroundWorkflow.styles} sourceTitle="上传商品图片" sourceHint="保留商品主体，自动生成电商白底图" submitLabel="生成白底图" pointsPerTask={5} cases={whiteBackgroundCases} productDescriptionLabel="处理要求" productDescriptionPlaceholder="填写需要保留的商品细节、阴影和平台白底规范" /></ProjectRequiredGate>; }
