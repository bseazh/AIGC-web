export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { WhiteBackgroundWorkspace } from "@/app/features/image-creation/white-background/white-background-workspace";

export default function Page() {
  return <ProjectRequiredGate workflowKey="white-background"><WhiteBackgroundWorkspace /></ProjectRequiredGate>;
}
