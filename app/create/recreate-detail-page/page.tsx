export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { RecreateDetailPageWorkspace } from "@/app/features/image-creation/recreate-detail-page/recreate-detail-page-workspace";

export default function Page() {
  return <ProjectRequiredGate workflowKey="recreate-detail-page"><RecreateDetailPageWorkspace /></ProjectRequiredGate>;
}
