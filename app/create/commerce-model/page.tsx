export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { CommerceModelWorkspace } from "@/app/features/image-creation/commerce-model/commerce-model-workspace";

export default function CommerceModelPage() {
  return (
    <ProjectRequiredGate workflowKey="commerce-model">
      <CommerceModelWorkspace />
    </ProjectRequiredGate>
  );
}
