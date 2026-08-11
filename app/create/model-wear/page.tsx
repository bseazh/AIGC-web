export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { ModelWearWorkspace } from "@/app/features/image-creation/model-wear/model-wear-workspace";

export default function ModelWearPage() {
  return <ProjectRequiredGate workflowKey="model-wear"><ModelWearWorkspace /></ProjectRequiredGate>;
}
