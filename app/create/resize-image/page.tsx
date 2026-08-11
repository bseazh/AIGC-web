export const dynamic = "force-dynamic";

import { ImageWorkflowPage } from "@/app/components/image-workflow-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { resizeImageCases } from "@/lib/image-workflow-cases";
import { resizeImageWorkflow } from "@/lib/product-config";
export default function Page() { return <ProjectRequiredGate workflowKey="resize-image"><ImageWorkflowPage title="图片比例调整" description="智能扩展画面并保持商品主体，默认生成 1 张，消耗 5 积分" submitUrl="/api/tasks/resize-image/" scenes={resizeImageWorkflow.scenes} styles={resizeImageWorkflow.styles} sourceTitle="上传待调整图片" sourceHint="支持常用电商比例，最大 10MB" submitLabel="调整图片比例" pointsPerTask={5} outputCount={1} cases={resizeImageCases} productDescriptionLabel="扩图要求" productDescriptionPlaceholder="填写目标平台比例、背景延展方向、主体保留要求" /></ProjectRequiredGate>; }
